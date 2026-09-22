import type { Env } from "@/config/env";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { randomToken, safeEqual } from "@/server/platform/crypto";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { pkceCodeChallenge } from "../domain/pkce";
import {
  deleteAccount,
  findAccountByProvider,
  findAccountForUser,
  insertGoogleAccount,
} from "../infra/account-repo";
import { exchangeGoogleCode, verifyGoogleIdToken } from "../infra/google-oauth-client";
import {
  grantRole,
  insertUser,
  markEmailVerified,
  normalizeEmail,
  findUserByEmail,
} from "../infra/user-repo";
import { recordConsent } from "../infra/consent-repo";
import type { OAuthPendingState } from "../http/oauth-state-cookie";
import { googleTookOwnershipMessage } from "./email-templates";
import { sendAuthEmail } from "./jobs";
import { issueSession } from "./session-issuer";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export type GoogleStartInput = { birthYear: number; termsVersion: string; privacyVersion: string };

export function startGoogleSignIn(
  input: GoogleStartInput,
  env: Env,
): { authorizationUrl: string; pending: OAuthPendingState } {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError("MAINTENANCE", { detail: "Sign-in with Google isn't available yet." });
  }
  const state = randomToken(16);
  const codeVerifier = randomToken(32);
  const nonce = randomToken(16);
  const redirectUri = `${env.APP_BASE_URL}/api/v1/auth/google/callback`;

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", pkceCodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");

  return {
    authorizationUrl: url.toString(),
    pending: {
      state,
      codeVerifier,
      nonce,
      birthYear: input.birthYear,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
    },
  };
}

export type GoogleCallbackInput = {
  code: string;
  state: string;
  pending: OAuthPendingState | null;
};
export type GoogleCallbackDeps = {
  db: Database;
  clock: Clock;
  env: Env;
  ipPrefix: string | null;
  userAgentHash: string | null;
};

/**
 * Handles the Google redirect (docs/07 §3.3): verifies state + PKCE + nonce, then either signs in an
 * existing linked account, links/takes over a matching local account, or creates a new one.
 */
export async function completeGoogleSignIn(
  input: GoogleCallbackInput,
  deps: GoogleCallbackDeps,
): Promise<{ token: string; userId: string; expiresAt: Date }> {
  if (!input.pending) {
    throw new AppError("BAD_REQUEST", { detail: "The sign-in attempt expired. Please try again." });
  }
  if (!safeEqual(input.pending.state, input.state)) {
    throw new AppError("FORBIDDEN", { detail: "The sign-in attempt could not be verified." });
  }
  if (!deps.env.GOOGLE_CLIENT_ID || !deps.env.GOOGLE_CLIENT_SECRET) {
    throw new AppError("MAINTENANCE", { detail: "Sign-in with Google isn't available yet." });
  }

  let identity;
  try {
    const { idToken } = await exchangeGoogleCode({
      code: input.code,
      codeVerifier: input.pending.codeVerifier,
      redirectUri: `${deps.env.APP_BASE_URL}/api/v1/auth/google/callback`,
      clientId: deps.env.GOOGLE_CLIENT_ID,
      clientSecret: deps.env.GOOGLE_CLIENT_SECRET,
    });
    identity = await verifyGoogleIdToken(idToken, deps.env.GOOGLE_CLIENT_ID, input.pending.nonce);
  } catch (error) {
    throw new AppError("PROVIDER_UNAVAILABLE", {
      detail: "Sign-in with Google failed. Please try again.",
      cause: error,
    });
  }
  if (!identity.emailVerified) {
    throw new AppError("FORBIDDEN", { detail: "This Google account's email is not verified." });
  }

  const now = deps.clock.now();
  const email = normalizeEmail(identity.email);
  const pending = input.pending;

  const userId = await deps.db.transaction(async (tx) => {
    const existingGoogleAccount = await findAccountByProvider(tx, "google", identity.sub);
    if (existingGoogleAccount) return existingGoogleAccount.userId;

    const existingUser = await findUserByEmail(tx, email);
    if (existingUser) {
      const credentialAccount = await findAccountForUser(tx, existingUser.id, "credential");
      if (credentialAccount && !existingUser.emailVerified) {
        // Pre-hijack defence (docs/07 §3.3): a verified Google identity takes over an unverified
        // local credential account rather than creating a conflicting second account.
        await deleteAccount(tx, credentialAccount.id);
        await markEmailVerified(tx, existingUser.id);
        await insertGoogleAccount(tx, existingUser.id, identity.sub);
        await writeAudit(tx, {
          actorType: "user",
          actorUserId: existingUser.id,
          action: "auth.google_took_ownership",
          targetType: "user",
          targetId: existingUser.id,
        });
        await enqueueJob(tx, sendAuthEmail, googleTookOwnershipMessage(existingUser.email));
        return existingUser.id;
      }
      // Verified local account with an exact email match: link automatically.
      await insertGoogleAccount(tx, existingUser.id, identity.sub);
      await writeAudit(tx, {
        actorType: "user",
        actorUserId: existingUser.id,
        action: "auth.google_linked",
        targetType: "user",
        targetId: existingUser.id,
      });
      return existingUser.id;
    }

    const minAge = await getSetting(tx, "age_policy.min_age", now);
    const approxAge = now.getFullYear() - pending.birthYear;
    if (!Number.isInteger(pending.birthYear) || approxAge < minAge || approxAge > 130) {
      throw new AppError("VALIDATION_FAILED", {
        errors: [
          {
            path: "birthYear",
            code: "underage",
            message: `You must be at least ${minAge} years old to create an account.`,
          },
        ],
      });
    }
    const user = await insertUser(tx, {
      email,
      displayName: identity.name?.trim() || email.split("@")[0] || "New user",
      birthYear: pending.birthYear,
      adultAttestedAt: now,
      emailVerified: true,
    });
    await insertGoogleAccount(tx, user.id, identity.sub);
    await grantRole(tx, user.id, "student", null);
    await recordConsent(tx, {
      userId: user.id,
      kind: "terms",
      version: pending.termsVersion,
      ipPrefix: deps.ipPrefix,
    });
    await recordConsent(tx, {
      userId: user.id,
      kind: "privacy",
      version: pending.privacyVersion,
      ipPrefix: deps.ipPrefix,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: user.id,
      action: "auth.sign_up",
      targetType: "user",
      targetId: user.id,
      metadata: { provider: "google" },
      ipPrefix: deps.ipPrefix,
    });
    return user.id;
  });

  const { token, session } = await deps.db.transaction(async (tx) => {
    const issued = await issueSession(tx, {
      userId,
      now,
      mfaVerified: false,
      ipPrefix: deps.ipPrefix,
      userAgentHash: deps.userAgentHash,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "auth.sign_in",
      targetType: "user",
      targetId: userId,
      metadata: { provider: "google" },
      ipPrefix: deps.ipPrefix,
    });
    return issued;
  });

  return { token, userId, expiresAt: session.expiresAt };
}

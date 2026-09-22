import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import { writeAudit } from "@/server/platform/audit";
import { consumeRateLimit } from "@/server/platform/rate-limit";
import { findAccountForUser, updatePasswordHash } from "../infra/account-repo";
import { insertToken } from "../infra/token-repo";
import { findUserByEmail, normalizeEmail } from "../infra/user-repo";
import { getTwoFactorForUser } from "../infra/mfa-repo";
import { DUMMY_HASH, needsRehash, verifyPassword, hashPassword } from "../infra/password-hasher";
import { issueSession } from "./session-issuer";

const MFA_PENDING_TTL_MS = 5 * 60 * 1000;
/** Account-scoped throttle (docs/07 §3.2): a fixed-window approximation of progressive delay. */
const ACCOUNT_THROTTLE_LIMIT = 5;
const ACCOUNT_THROTTLE_WINDOW_SECONDS = 15 * 60;

export type SignInInput = { email: string; password: string };
export type SignInDeps = {
  db: Database;
  clock: Clock;
  ipPrefix: string | null;
  userAgentHash: string | null;
};

export type SignInResult =
  | { outcome: "signed_in"; token: string; userId: string; expiresAt: Date }
  | { outcome: "mfa_required"; pendingToken: string };

export async function signIn(input: SignInInput, deps: SignInDeps): Promise<SignInResult> {
  const now = deps.clock.now();
  const email = normalizeEmail(input.email);

  const throttle = await consumeRateLimit(
    deps.db,
    {
      key: `auth.sign_in:account:${sha256Hex(email)}`,
      limit: ACCOUNT_THROTTLE_LIMIT,
      windowSeconds: ACCOUNT_THROTTLE_WINDOW_SECONDS,
    },
    now,
  );
  if (!throttle.allowed) {
    throw new AppError("RATE_LIMITED", {
      headers: {
        "retry-after": String(
          Math.max(1, Math.ceil((throttle.resetAt.getTime() - now.getTime()) / 1000)),
        ),
      },
    });
  }

  const user = await findUserByEmail(deps.db, email);
  if (user?.status === "deleted") {
    throw new AppError("BAD_REQUEST", { detail: "This account no longer exists." });
  }
  const account = user ? await findAccountForUser(deps.db, user.id, "credential") : undefined;

  const hashToVerify = account?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(hashToVerify, input.password);
  if (!user || !account?.passwordHash || !passwordOk) {
    throw new AppError("INVALID_CREDENTIALS");
  }

  if (needsRehash(account.passwordHash)) {
    await updatePasswordHash(deps.db, account.id, await hashPassword(input.password)).catch(
      () => undefined,
    );
  }

  const twoFactor = await getTwoFactorForUser(deps.db, user.id);
  if (twoFactor?.enabled) {
    const pendingToken = randomToken(32);
    await insertToken(deps.db, {
      userId: user.id,
      purpose: "mfa_pending",
      tokenHash: sha256Hex(pendingToken),
      expiresAt: new Date(now.getTime() + MFA_PENDING_TTL_MS),
      metadata: { ipPrefix: deps.ipPrefix, userAgentHash: deps.userAgentHash },
    });
    return { outcome: "mfa_required", pendingToken };
  }

  const { token, session } = await deps.db.transaction(async (tx) => {
    const issued = await issueSession(tx, {
      userId: user.id,
      now,
      mfaVerified: false,
      ipPrefix: deps.ipPrefix,
      userAgentHash: deps.userAgentHash,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: user.id,
      action: "auth.sign_in",
      targetType: "user",
      targetId: user.id,
      ipPrefix: deps.ipPrefix,
    });
    return issued;
  });

  return { outcome: "signed_in", token, userId: user.id, expiresAt: session.expiresAt };
}

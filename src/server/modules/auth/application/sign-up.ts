import { brand } from "@/config/brand";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError, type FieldError } from "@/server/platform/errors";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { getSetting } from "@/server/platform/settings/settings";
import { writeAudit } from "@/server/platform/audit";
import { checkPasswordPolicy } from "../domain/password-policy";
import { insertCredentialAccount } from "../infra/account-repo";
import { recordConsent } from "../infra/consent-repo";
import { insertToken } from "../infra/token-repo";
import { findUserByEmail, grantRole, insertUser, normalizeEmail } from "../infra/user-repo";
import { hashPassword } from "../infra/password-hasher";
import { attemptedSignUpMessage, verifyEmailMessage } from "./email-templates";
import { sendAuthEmail } from "./jobs";
import type { BreachedPasswordChecker } from "./ports";

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PASSWORD_LENGTH = 128;

export type SignUpInput = {
  email: string;
  password: string;
  displayName: string;
  birthYear: number;
  termsVersion: string;
  privacyVersion: string;
};

export type SignUpDependencies = {
  db: Database;
  clock: Clock;
  appBaseUrl: string;
  ipPrefix: string | null;
  checkBreached: BreachedPasswordChecker;
};

/** Always resolves the same way regardless of branch taken — the caller's response must not leak it. */
export type SignUpResult = { outcome: "check_inbox" };

/**
 * Sign-up (docs/07 §3.1). No enumeration: an email that already has an account never creates a
 * second one or reveals that fact to the caller — the owner gets a notice email instead.
 */
export async function signUp(input: SignUpInput, deps: SignUpDependencies): Promise<SignUpResult> {
  const now = deps.clock.now();
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();

  const errors: FieldError[] = [];
  if (displayName.length < 1 || displayName.length > 120) {
    errors.push({ path: "displayName", code: "invalid_size", message: "Enter your name." });
  }

  const minAge = await getSetting(deps.db, "age_policy.min_age", now);
  const approxAge = now.getFullYear() - input.birthYear;
  if (!Number.isInteger(input.birthYear) || approxAge < minAge || approxAge > 130) {
    errors.push({
      path: "birthYear",
      code: "underage",
      message: `You must be at least ${minAge} years old to create an account.`,
    });
  }

  const existing = await findUserByEmail(deps.db, email);
  if (existing) {
    if (errors.length > 0) throw new AppError("VALIDATION_FAILED", { errors });
    await deps.db.transaction(async (tx) => {
      const dayBucket = now.toISOString().slice(0, 10);
      await enqueueJob(tx, sendAuthEmail, attemptedSignUpMessage(email, deps.appBaseUrl), {
        dedupeKey: `auth.attempted_signup:${existing.id}:${dayBucket}`,
      });
    });
    return { outcome: "check_inbox" };
  }

  const minLength = await getSetting(deps.db, "auth.password_min_length", now);
  errors.push(
    ...checkPasswordPolicy(input.password, {
      minLength,
      maxLength: MAX_PASSWORD_LENGTH,
      contextBlocklist: [brand.name, email.split("@")[0] ?? "", displayName],
    }),
  );
  if (errors.length === 0 && (await deps.checkBreached(input.password))) {
    errors.push({
      path: "password",
      code: "breached",
      message: "This password has appeared in a data breach. Choose a different one.",
    });
  }
  if (errors.length > 0) throw new AppError("VALIDATION_FAILED", { errors });

  const passwordHash = await hashPassword(input.password);
  const verifyToken = randomToken(32);

  await deps.db.transaction(async (tx) => {
    const user = await insertUser(tx, {
      email,
      displayName,
      birthYear: input.birthYear,
      adultAttestedAt: now,
    });
    await insertCredentialAccount(tx, user.id, email, passwordHash);
    await grantRole(tx, user.id, "student", null);
    await recordConsent(tx, {
      userId: user.id,
      kind: "terms",
      version: input.termsVersion,
      ipPrefix: deps.ipPrefix,
    });
    await recordConsent(tx, {
      userId: user.id,
      kind: "privacy",
      version: input.privacyVersion,
      ipPrefix: deps.ipPrefix,
    });
    await insertToken(tx, {
      userId: user.id,
      purpose: "email_verify",
      tokenHash: sha256Hex(verifyToken),
      expiresAt: new Date(now.getTime() + EMAIL_VERIFY_TTL_MS),
    });
    await enqueueJob(tx, sendAuthEmail, verifyEmailMessage(email, deps.appBaseUrl, verifyToken));
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: user.id,
      action: "auth.sign_up",
      targetType: "user",
      targetId: user.id,
      ipPrefix: deps.ipPrefix,
    });
  });

  return { outcome: "check_inbox" };
}

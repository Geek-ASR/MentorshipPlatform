import { and, eq, isNull } from "drizzle-orm";
import { brand } from "@/config/brand";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError, type FieldError } from "@/server/platform/errors";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { checkPasswordPolicy } from "../domain/password-policy";
import { updatePasswordHash } from "../infra/account-repo";
import { authAccounts, authVerificationTokens } from "../infra/tables";
import { consumeToken, insertToken, invalidateOutstandingTokens } from "../infra/token-repo";
import { findUserByEmail, findUserById, normalizeEmail } from "../infra/user-repo";
import { revokeAllSessionsForUser } from "../infra/session-repo";
import { hashPassword } from "../infra/password-hasher";
import { passwordResetCompletedMessage, passwordResetMessage } from "./email-templates";
import { sendAuthEmail } from "./jobs";
import type { BreachedPasswordChecker } from "./ports";

const RESET_TTL_MS = 30 * 60 * 1000;
const MAX_PASSWORD_LENGTH = 128;

export async function requestPasswordReset(
  email: string,
  deps: { db: Database; clock: Clock; appBaseUrl: string },
): Promise<void> {
  const now = deps.clock.now();
  const user = await findUserByEmail(deps.db, normalizeEmail(email));
  // Always the same response to the caller regardless of whether the account exists (no enumeration).
  if (!user) return;

  const token = randomToken(32);
  await deps.db.transaction(async (tx) => {
    await invalidateOutstandingTokens(tx, user.id, "password_reset", now);
    await insertToken(tx, {
      userId: user.id,
      purpose: "password_reset",
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    });
    await enqueueJob(tx, sendAuthEmail, passwordResetMessage(user.email, deps.appBaseUrl, token));
  });
}

export async function resetPassword(
  input: { token: string; newPassword: string },
  deps: { db: Database; clock: Clock; checkBreached: BreachedPasswordChecker },
): Promise<void> {
  const now = deps.clock.now();
  const tokenHash = sha256Hex(input.token);

  // Peek the user without consuming yet, so policy errors don't burn the single-use token.
  const [preview] = await deps.db
    .select()
    .from(authVerificationTokens)
    .where(
      and(
        eq(authVerificationTokens.purpose, "password_reset"),
        eq(authVerificationTokens.tokenHash, tokenHash),
        isNull(authVerificationTokens.consumedAt),
      ),
    )
    .limit(1);
  if (!preview || preview.expiresAt <= now) {
    throw new AppError("BAD_REQUEST", { detail: "This link is invalid or has expired." });
  }

  const user = await findUserById(deps.db, preview.userId);
  if (!user) throw new AppError("BAD_REQUEST");

  const minLength = await getSetting(deps.db, "auth.password_min_length", now);
  const errors: FieldError[] = checkPasswordPolicy(input.newPassword, {
    minLength,
    maxLength: MAX_PASSWORD_LENGTH,
    contextBlocklist: [brand.name, user.email.split("@")[0] ?? "", user.displayName],
  });
  if (errors.length === 0 && (await deps.checkBreached(input.newPassword))) {
    errors.push({
      path: "newPassword",
      code: "breached",
      message: "This password has appeared in a data breach. Choose a different one.",
    });
  }
  if (errors.length > 0) throw new AppError("VALIDATION_FAILED", { errors });

  const passwordHash = await hashPassword(input.newPassword);

  await deps.db.transaction(async (tx) => {
    const consumed = await consumeToken(tx, "password_reset", tokenHash, now);
    if (!consumed)
      throw new AppError("BAD_REQUEST", { detail: "This link is invalid or has expired." });

    const [account] = await tx
      .select()
      .from(authAccounts)
      .where(eq(authAccounts.userId, user.id))
      .limit(1);
    if (account) {
      await updatePasswordHash(tx, account.id, passwordHash);
    }
    await revokeAllSessionsForUser(tx, user.id, "password_reset", now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: user.id,
      action: "auth.password_reset",
      targetType: "user",
      targetId: user.id,
    });
    await enqueueJob(tx, sendAuthEmail, passwordResetCompletedMessage(user.email));
  });
}

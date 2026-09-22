import { brand } from "@/config/brand";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError, type FieldError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { getSetting } from "@/server/platform/settings/settings";
import { checkPasswordPolicy } from "../domain/password-policy";
import { findAccountForUser, updatePasswordHash } from "../infra/account-repo";
import { revokeAllSessionsForUser } from "../infra/session-repo";
import { findUserById } from "../infra/user-repo";
import { hashPassword, verifyPassword } from "../infra/password-hasher";
import { passwordResetCompletedMessage } from "./email-templates";
import { sendAuthEmail } from "./jobs";
import type { BreachedPasswordChecker } from "./ports";

const MAX_PASSWORD_LENGTH = 128;

/** Authenticated password change. Callers must already have enforced step-up (docs/07 §5). */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  deps: {
    db: Database;
    clock: Clock;
    checkBreached: BreachedPasswordChecker;
    keepSessionId: string;
  },
): Promise<void> {
  const now = deps.clock.now();
  const user = await findUserById(deps.db, userId);
  const account = await findAccountForUser(deps.db, userId, "credential");
  if (!user || !account?.passwordHash) throw new AppError("BAD_REQUEST");

  if (!(await verifyPassword(account.passwordHash, input.currentPassword))) {
    throw new AppError("INVALID_CREDENTIALS", { detail: "Current password is incorrect." });
  }

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
    await updatePasswordHash(tx, account.id, passwordHash);
    await revokeAllSessionsForUser(tx, userId, "password_changed", now, deps.keepSessionId);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "auth.password_changed",
      targetType: "user",
      targetId: userId,
    });
    await enqueueJob(tx, sendAuthEmail, passwordResetCompletedMessage(user.email));
  });
}

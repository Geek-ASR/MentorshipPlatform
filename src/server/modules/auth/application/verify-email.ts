import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import { writeAudit } from "@/server/platform/audit";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { consumeToken, insertToken, invalidateOutstandingTokens } from "../infra/token-repo";
import { findUserById, markEmailVerified } from "../infra/user-repo";
import { verifyEmailMessage } from "./email-templates";
import { sendAuthEmail } from "./jobs";

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export async function verifyEmail(
  token: string,
  deps: { db: Database; clock: Clock },
): Promise<void> {
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    const row = await consumeToken(tx, "email_verify", sha256Hex(token), now);
    if (!row) throw new AppError("BAD_REQUEST", { detail: "This link is invalid or has expired." });
    await markEmailVerified(tx, row.userId);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: row.userId,
      action: "auth.email_verified",
      targetType: "user",
      targetId: row.userId,
    });
  });
}

/**
 * Sends a fresh verification link to a signed-in user whose email is still unverified (docs/19
 * Phase 15: the dashboard's "verify your email" notice needs a way to recover from an expired or
 * lost link). Earlier links stop working, so only the newest email in the inbox is live. A
 * no-op for an already-verified account.
 */
export async function resendVerificationEmail(
  userId: string,
  deps: { db: Database; clock: Clock; appBaseUrl: string },
): Promise<{ outcome: "sent" | "already_verified" }> {
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    const user = await findUserById(tx, userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    if (user.emailVerified) return { outcome: "already_verified" as const };
    const token = randomToken(32);
    await invalidateOutstandingTokens(tx, userId, "email_verify", now);
    await insertToken(tx, {
      userId,
      purpose: "email_verify",
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + EMAIL_VERIFY_TTL_MS),
    });
    await enqueueJob(tx, sendAuthEmail, verifyEmailMessage(user.email, deps.appBaseUrl, token));
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "auth.email_verification_resent",
      targetType: "user",
      targetId: userId,
    });
    return { outcome: "sent" as const };
  });
}

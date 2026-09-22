import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { writeAudit } from "@/server/platform/audit";
import { consumeToken, insertToken } from "../infra/token-repo";
import { findUserByEmail, findUserById, normalizeEmail, updateUserEmail } from "../infra/user-repo";
import { revokeAllSessionsForUser } from "../infra/session-repo";
import { emailChangeConfirmMessage, emailChangeRevertMessage } from "./email-templates";
import { sendAuthEmail } from "./jobs";

const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
const REVERT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Sends a confirmation link to the new address. The account email only changes on confirmation. */
export async function requestEmailChange(
  userId: string,
  newEmail: string,
  deps: { db: Database; clock: Clock; appBaseUrl: string },
): Promise<void> {
  const now = deps.clock.now();
  const normalized = normalizeEmail(newEmail);
  const existing = await findUserByEmail(deps.db, normalized);
  if (existing) {
    // Same response either way: don't reveal whether the address is already taken.
    return;
  }
  const token = randomToken(32);
  await deps.db.transaction(async (tx) => {
    await insertToken(tx, {
      userId,
      purpose: "email_change",
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + CONFIRM_TTL_MS),
      metadata: { newEmail: normalized },
    });
    await enqueueJob(
      tx,
      sendAuthEmail,
      emailChangeConfirmMessage(normalized, deps.appBaseUrl, token),
    );
  });
}

export async function confirmEmailChange(
  token: string,
  deps: { db: Database; clock: Clock; appBaseUrl: string },
): Promise<void> {
  const now = deps.clock.now();
  const consumed = await consumeToken(deps.db, "email_change", sha256Hex(token), now);
  if (!consumed)
    throw new AppError("BAD_REQUEST", { detail: "This link is invalid or has expired." });
  const newEmail = (consumed.metadata as { newEmail?: string }).newEmail;
  if (!newEmail) throw new AppError("BAD_REQUEST");

  const user = await findUserById(deps.db, consumed.userId);
  if (!user) throw new AppError("BAD_REQUEST");
  const oldEmail = user.email;
  const revertToken = randomToken(32);

  await deps.db.transaction(async (tx) => {
    await updateUserEmail(tx, user.id, newEmail);
    await insertToken(tx, {
      userId: user.id,
      purpose: "email_change_revert",
      tokenHash: sha256Hex(revertToken),
      expiresAt: new Date(now.getTime() + REVERT_TTL_MS),
      metadata: { oldEmail },
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: user.id,
      action: "auth.email_changed",
      targetType: "user",
      targetId: user.id,
      metadata: { from: oldEmail, to: newEmail },
    });
    await enqueueJob(
      tx,
      sendAuthEmail,
      emailChangeRevertMessage(oldEmail, deps.appBaseUrl, revertToken),
    );
  });
}

/** "Wasn't you?" link (docs/07 §3.5): reverts the email and signs out every device. */
export async function revertEmailChange(
  token: string,
  deps: { db: Database; clock: Clock },
): Promise<void> {
  const now = deps.clock.now();
  const consumed = await consumeToken(deps.db, "email_change_revert", sha256Hex(token), now);
  if (!consumed)
    throw new AppError("BAD_REQUEST", { detail: "This link is invalid or has expired." });
  const oldEmail = (consumed.metadata as { oldEmail?: string }).oldEmail;
  if (!oldEmail) throw new AppError("BAD_REQUEST");

  await deps.db.transaction(async (tx) => {
    await updateUserEmail(tx, consumed.userId, oldEmail);
    await revokeAllSessionsForUser(tx, consumed.userId, "email_change_reverted", now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: consumed.userId,
      action: "auth.email_change_reverted",
      targetType: "user",
      targetId: consumed.userId,
    });
  });
}

import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import {
  blockUser as insertBlock,
  isBlocked as checkBlocked,
  listBlockedByUser,
  unblockUser as deleteBlock,
  type UserBlockRow,
} from "../infra/block-repo";

/** Either party may block unilaterally, no counterparty consent needed (docs/10 Phase 10). */
export async function blockUser(
  db: Database,
  blockerId: string,
  blockedId: string,
  reasonCode: string | null,
): Promise<UserBlockRow> {
  if (blockerId === blockedId) {
    throw new AppError("BAD_REQUEST", { detail: "You can't block yourself." });
  }
  const row = await insertBlock(db, blockerId, blockedId, reasonCode);
  await writeAudit(db, {
    actorType: "user",
    actorUserId: blockerId,
    action: "user.blocked",
    targetType: "user",
    targetId: blockedId,
    metadata: { reasonCode },
  });
  return row;
}

export async function unblockUser(
  db: Database,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await deleteBlock(db, blockerId, blockedId);
  await writeAudit(db, {
    actorType: "user",
    actorUserId: blockerId,
    action: "user.unblocked",
    targetType: "user",
    targetId: blockedId,
  });
}

export const isBlocked = checkBlocked;
export const listMyBlocks = listBlockedByUser;

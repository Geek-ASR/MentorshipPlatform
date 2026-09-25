import { and, eq, or } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { userBlocks } from "./tables";

export type UserBlockRow = typeof userBlocks.$inferSelect;

export async function blockUser(
  executor: Executor,
  blockerId: string,
  blockedId: string,
  reasonCode: string | null,
): Promise<UserBlockRow> {
  const [row] = await executor
    .insert(userBlocks)
    .values({ id: newId(), blockerId, blockedId, reasonCode })
    .onConflictDoNothing({ target: [userBlocks.blockerId, userBlocks.blockedId] })
    .returning();
  if (row) return row;
  const [existing] = await executor
    .select()
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
    .limit(1);
  return existing!;
}

export async function unblockUser(
  executor: Executor,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await executor
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
}

/** True if either user has blocked the other (docs/09 §5: "no block between the two users"). */
export async function isBlocked(
  executor: Executor,
  userA: string,
  userB: string,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, userA), eq(userBlocks.blockedId, userB)),
        and(eq(userBlocks.blockerId, userB), eq(userBlocks.blockedId, userA)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function listBlockedByUser(
  executor: Executor,
  blockerId: string,
): Promise<UserBlockRow[]> {
  return executor.select().from(userBlocks).where(eq(userBlocks.blockerId, blockerId));
}

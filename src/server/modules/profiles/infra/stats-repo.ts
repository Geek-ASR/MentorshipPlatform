import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { mentorStats } from "./tables";

export type MentorStatsRow = typeof mentorStats.$inferSelect;

/** Every mentor gets a zeroed stats row the moment their profile is created (docs/05 §3.1). */
export async function ensureStatsRow(executor: Executor, mentorUserId: string): Promise<void> {
  await executor
    .insert(mentorStats)
    .values({ mentorUserId })
    .onConflictDoNothing({ target: mentorStats.mentorUserId });
}

export async function findStats(
  executor: Executor,
  mentorUserId: string,
): Promise<MentorStatsRow | undefined> {
  const [row] = await executor
    .select()
    .from(mentorStats)
    .where(eq(mentorStats.mentorUserId, mentorUserId))
    .limit(1);
  return row;
}

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

/** Pushed in by `trust` (ADR-025's pattern, reused): `profiles` owns the `mentor_stats` table, but
 * the numbers themselves — sessions completed, reliability, review count/average — are computed from
 * booking/review/trust-event data `profiles` never reads directly, to avoid a `profiles -> trust`
 * edge that would cycle against the pre-existing `booking -> profiles` dependency (docs/19 Phase 10
 * ADR-035). */
export async function upsertStats(
  executor: Executor,
  mentorUserId: string,
  stats: {
    sessionsCompleted: number;
    reliabilityPct: number;
    reviewCount: number;
    avgRating: number | null;
  },
): Promise<void> {
  await executor
    .insert(mentorStats)
    .values({
      mentorUserId,
      sessionsCompleted: stats.sessionsCompleted,
      reliabilityPct: stats.reliabilityPct,
      reviewCount: stats.reviewCount,
      avgRating: stats.avgRating === null ? null : stats.avgRating.toFixed(2),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: mentorStats.mentorUserId,
      set: {
        sessionsCompleted: stats.sessionsCompleted,
        reliabilityPct: stats.reliabilityPct,
        reviewCount: stats.reviewCount,
        avgRating: stats.avgRating === null ? null : stats.avgRating.toFixed(2),
        updatedAt: new Date(),
      },
    });
}

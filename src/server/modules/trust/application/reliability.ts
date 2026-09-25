import type { Database, Executor } from "@/server/platform/db/client";
import { listBookingsForMentor, sessionWindow } from "@/server/modules/booking";
import { mentorProfiles, updateMentorStats } from "@/server/modules/profiles";
import { computeReliabilityPct } from "../domain/reliability";
import type { TrustEventType } from "../domain/types";
import { computePlatformMeanRating, listPublishedReviewsForMentor } from "../infra/reviews-repo";
import { setPlatformMeanRating } from "../infra/stats-repo";
import { listRecentEventsForSubject } from "../infra/trust-events-repo";

const RELIABILITY_WINDOW_DAYS = 90; // docs/17 §11: "1 − no-show/late-cancel rate, 90d".
const RELIABILITY_EVENT_TYPES: ReadonlySet<TrustEventType> = new Set([
  "mentor_no_show",
  "mentor_late_cancel_24h",
  "mentor_late_cancel_2h",
]);
const ENDED_STATUSES = [
  "completed",
  "no_show_mentor",
  "no_show_student",
  "resolved_refunded",
  "disputed",
] as const;

/** Recomputes one mentor's `mentor_stats` row (docs/05 §3.1) from booking/review/trust-event data —
 * pushed into `profiles` via `updateMentorStats` (ADR-025's "push a fact in" pattern, reused). Called
 * incrementally after anything that changes these numbers (a review publishes, a trust event is
 * recorded) and swept nightly for decay (a trust event aging out of its 90-day window should lower
 * the *next* run's unreliable count even with no new activity). */
export async function recomputeMentorStats(
  executor: Executor,
  mentorUserId: string,
  now: Date,
): Promise<void> {
  const [endedBookings, completedBookings, eventRows, reviews] = await Promise.all([
    listBookingsForMentor(executor, mentorUserId, { statuses: [...ENDED_STATUSES] }),
    listBookingsForMentor(executor, mentorUserId, { statuses: ["completed"] }),
    listRecentEventsForSubject(executor, mentorUserId, RELIABILITY_WINDOW_DAYS, now),
    listPublishedReviewsForMentor(executor, mentorUserId),
  ]);

  const windowStart = now.getTime() - RELIABILITY_WINDOW_DAYS * 86_400_000;
  const endedInWindow = endedBookings.filter(
    (b) => sessionWindow(b.session).end.getTime() >= windowStart,
  );
  const unreliableCount = eventRows.filter(
    (e) =>
      !e.excused &&
      (e.expiresAt === null || e.expiresAt > now) &&
      RELIABILITY_EVENT_TYPES.has(e.type),
  ).length;

  const reviewCount = reviews.length;
  const avgRating =
    reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : null;

  await updateMentorStats(executor, mentorUserId, {
    sessionsCompleted: completedBookings.length,
    reliabilityPct: computeReliabilityPct(unreliableCount, endedInWindow.length),
    reviewCount,
    avgRating,
  });
}

/** Nightly sweep (docs/10 §13's metrics rely on stats staying fresh even without new activity) —
 * recomputes every mentor's stats and the platform mean rating that feeds the Bayesian prior. */
export async function recomputeAllMentorStats(db: Database, now: Date): Promise<number> {
  const mentors = await db.select({ userId: mentorProfiles.userId }).from(mentorProfiles);
  for (const { userId } of mentors) {
    await db.transaction((tx) => recomputeMentorStats(tx, userId, now));
  }
  const meanRating = await computePlatformMeanRating(db);
  await setPlatformMeanRating(db, meanRating);
  return mentors.length;
}

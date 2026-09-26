import type { Database } from "@/server/platform/db/client";
import { getSetting } from "@/server/platform/settings/settings";
import { findUsersByIds } from "@/server/modules/auth";
import { getMentorProfileDetailBySlug, type MentorProfileDetail } from "@/server/modules/profiles";
import { listCredentials, type CredentialRow } from "@/server/modules/verification";
import { findSchedulingSettings, listServicesForMentor } from "@/server/modules/booking";
import { findReviewResponse, listPublishedReviewsForMentor } from "@/server/modules/trust";
import { loadEventTeasers, type EventTeaser } from "./home";
import { MIN_REVIEWS_FOR_RATING } from "./mentor-cards";

export type ProfileReview = {
  id: string;
  rating: number;
  body: string;
  authorName: string;
  publishedAt: Date;
  response: { body: string; publishedAt: Date | null } | null;
};

export type MentorProfileView = {
  detail: MentorProfileDetail;
  credentials: CredentialRow[];
  services: {
    id: string;
    title: string;
    description: string | null;
    prices: { durationMin: number; priceMinor: number; currency: string }[];
    intakeQuestions: { id: string; label: string }[];
  }[];
  timezone: string;
  maxAdvanceDays: number;
  reviews: ProfileReview[];
  histogram: { stars: number; count: number }[];
  rating: { average: number; count: number } | null;
  events: EventTeaser[];
  policy: { fullRefundHours: number; partialRefundHours: number; partialRefundPct: number };
};

/** "Ananya I." — reviewers are named by first name and last initial only (docs/10 §4). */
function reviewerName(displayName: string | undefined): string {
  if (!displayName) return "A student";
  const parts = displayName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]!.charAt(0)}.` : parts[0]!;
}

/** Everything the public mentor profile shows (docs/22 §3 J1 step 2), or null when not listed. */
export async function loadMentorProfile(
  db: Database,
  slug: string,
  now: Date,
): Promise<MentorProfileView | null> {
  const detail = await getMentorProfileDetailBySlug(db, slug);
  if (!detail || !detail.profile.isListed) return null;
  const mentorId = detail.profile.userId;

  const [credentials, services, settings, reviewRows, events, full, partial, partialPct] =
    await Promise.all([
      listCredentials(db, mentorId),
      listServicesForMentor(db, mentorId),
      findSchedulingSettings(db, mentorId),
      listPublishedReviewsForMentor(db, mentorId),
      loadEventTeasers(db, now, 50),
      getSetting(db, "cancellation.student.full_refund_hours", now),
      getSetting(db, "cancellation.student.partial_refund_hours", now),
      getSetting(db, "cancellation.student.partial_refund_pct", now),
    ]);

  const sortedReviews = [...reviewRows].sort(
    (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
  );
  const [authors, responses] = await Promise.all([
    findUsersByIds(db, [...new Set(sortedReviews.map((r) => r.authorUserId))]),
    Promise.all(sortedReviews.map((r) => findReviewResponse(db, r.id))),
  ]);
  const authorName = new Map(authors.map((a) => [a.id, a.displayName]));
  const reviews: ProfileReview[] = sortedReviews.map((review, index) => {
    const response = responses[index];
    return {
      id: review.id,
      rating: review.rating,
      body: review.body,
      authorName: reviewerName(authorName.get(review.authorUserId)),
      publishedAt: review.publishedAt ?? review.createdAt,
      response:
        response && response.status === "published"
          ? { body: response.body, publishedAt: response.publishedAt }
          : null,
    };
  });

  const histogram = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((r) => r.rating === stars).length,
  }));
  const stats = detail.stats;
  const rating =
    stats && stats.reviewCount >= MIN_REVIEWS_FOR_RATING && stats.avgRating !== null
      ? { average: Number(stats.avgRating), count: stats.reviewCount }
      : null;

  return {
    detail,
    credentials: credentials.filter((c) => c.status === "active"),
    services: services
      .filter((s) => s.isActive && s.kind === "one_on_one" && s.prices.length > 0)
      .map((s) => ({
        id: s.id,
        title: s.title,
        description: s.descriptionMd,
        prices: s.prices
          .map((p) => ({
            durationMin: p.durationMin,
            priceMinor: p.priceMinor,
            currency: p.currency,
          }))
          .sort((a, b) => a.durationMin - b.durationMin),
        intakeQuestions: s.intakeQuestions,
      })),
    timezone: settings?.timezone ?? "UTC",
    maxAdvanceDays: settings?.maxAdvanceDays ?? 30,
    reviews,
    histogram,
    rating,
    events: events.filter((e) => e.hostUserId === mentorId),
    policy: { fullRefundHours: full, partialRefundHours: partial, partialRefundPct: partialPct },
  };
}

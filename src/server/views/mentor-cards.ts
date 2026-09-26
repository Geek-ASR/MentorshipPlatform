import type { Database } from "@/server/platform/db/client";
import { getMentorProfileDetail } from "@/server/modules/profiles";
import { listCredentials } from "@/server/modules/verification";
import { listServicesForMentor } from "@/server/modules/booking";

/** Reviews needed before an average is shown (matches the profile page, docs/10 §4.3). */
export const MIN_REVIEWS_FOR_RATING = 3;

export type MentorCardView = {
  userId: string;
  slug: string;
  name: string;
  headline: string | null;
  countryIso2: string | null;
  isListed: boolean;
  /** The current (or most recent) affiliation, with its verification if one is active. */
  affiliation: {
    title: string;
    organizationName: string | null;
    kind: string;
    verifiedAt: Date | null;
  } | null;
  verifiedCount: number;
  languages: string[];
  expertise: string[];
  rating: { average: number; count: number } | null;
  sessionsCompleted: number;
  reliabilityPct: number | null;
  /** Cheapest active 1:1 price, for "from ₹X / 30 min" (docs/22 §3 J1). */
  fromPrice: { priceMinor: number; currency: string; durationMin: number } | null;
  volunteer: boolean;
};

/**
 * Card read model for explore, home and saved-mentor lists (docs/22 §3 J1: name, headline, top
 * badges, rating or "New mentor", "from ₹X / 30 min"). Composed from the profiles, verification and
 * booking public APIs rather than living in any one module, since no module owns all of it.
 *
 * One composition per mentor, run in parallel — fine for page-sized lists (≤ 20); a batched query
 * is the known next step if listing sizes grow.
 */
export async function loadMentorCard(
  db: Database,
  mentorUserId: string,
): Promise<MentorCardView | null> {
  const [detail, credentials, services] = await Promise.all([
    getMentorProfileDetail(db, mentorUserId),
    listCredentials(db, mentorUserId),
    listServicesForMentor(db, mentorUserId),
  ]);
  if (!detail) return null;

  const activeCredentials = credentials.filter((c) => c.status === "active");
  const verifiedAtByAffiliation = new Map(
    activeCredentials
      .filter((c) => c.affiliationId)
      .map((c) => [c.affiliationId!, c.verifiedAt] as const),
  );
  const ranked = [...detail.affiliations].sort((a, b) => {
    const score = (x: (typeof detail.affiliations)[number]) =>
      (x.isCurrent ? 2 : 0) + (verifiedAtByAffiliation.has(x.id) ? 1 : 0);
    return score(b) - score(a);
  });
  const top = ranked[0];

  const prices = services
    .filter((s) => s.isActive && s.kind === "one_on_one")
    .flatMap((s) => s.prices);
  const cheapest = prices.reduce<(typeof prices)[number] | null>(
    (best, p) =>
      best === null ||
      p.priceMinor < best.priceMinor ||
      (p.priceMinor === best.priceMinor && p.durationMin < best.durationMin)
        ? p
        : best,
    null,
  );

  const stats = detail.stats;
  return {
    userId: detail.profile.userId,
    slug: detail.profile.slug,
    name: detail.displayName,
    headline: detail.profile.headline,
    countryIso2: detail.countryIso2,
    isListed: detail.profile.isListed,
    affiliation: top
      ? {
          title: top.title,
          organizationName: top.organizationName,
          kind: top.kind,
          verifiedAt: verifiedAtByAffiliation.get(top.id) ?? null,
        }
      : null,
    verifiedCount: activeCredentials.length,
    languages: detail.languages.map((l) => l.name),
    expertise: detail.expertise.map((e) => e.name),
    rating:
      stats && stats.reviewCount >= MIN_REVIEWS_FOR_RATING && stats.avgRating !== null
        ? { average: Number(stats.avgRating), count: stats.reviewCount }
        : null,
    sessionsCompleted: stats?.sessionsCompleted ?? 0,
    reliabilityPct: stats && stats.sessionsCompleted > 0 ? stats.reliabilityPct : null,
    fromPrice: cheapest
      ? {
          priceMinor: cheapest.priceMinor,
          currency: cheapest.currency,
          durationMin: cheapest.durationMin,
        }
      : null,
    volunteer: detail.profile.payoutMode === "volunteer",
  };
}

export async function loadMentorCards(
  db: Database,
  mentorUserIds: string[],
): Promise<MentorCardView[]> {
  const cards = await Promise.all(mentorUserIds.map((id) => loadMentorCard(db, id)));
  return cards.filter((card): card is MentorCardView => card !== null);
}

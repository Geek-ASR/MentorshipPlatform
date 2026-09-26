import type { Database } from "@/server/platform/db/client";
import { findUsersByIds } from "@/server/modules/auth";
import { findMentorProfile, searchMentors } from "@/server/modules/profiles";
import {
  listLiveBookingsForSession,
  listPublicEvents,
  sessionWindow,
} from "@/server/modules/booking";
import { listPublishedArticles } from "@/server/modules/content";
import { loadMentorCards, type MentorCardView } from "./mentor-cards";

/** How many listed mentors the home page considers when choosing whom to show. */
const CANDIDATE_POOL = 24;

export type EventTeaser = {
  slug: string;
  title: string;
  start: Date;
  end: Date;
  hostName: string;
  hostUserId: string;
  hostSlug: string | null;
  seatsLeft: number;
  capacity: number;
};

export type GuideTeaser = {
  slug: string;
  title: string;
  dek: string | null;
  lastVerifiedAt: Date | null;
  countryIso2: string | null;
};

function byStrength(a: MentorCardView, b: MentorCardView): number {
  const rating = (card: MentorCardView) => (card.rating ? card.rating.average : 0);
  return (
    rating(b) - rating(a) ||
    b.sessionsCompleted - a.sessionsCompleted ||
    b.verifiedCount - a.verifiedCount
  );
}

/** Upcoming public events, soonest first, with host and live seat counts (docs/22 §9: seat
 * counts shown are real). */
export async function loadEventTeasers(
  db: Database,
  now: Date,
  limit: number,
): Promise<EventTeaser[]> {
  const events = await listPublicEvents(db, now);
  const upcoming = [...events]
    .sort(
      (a, b) => sessionWindow(a.session).start.getTime() - sessionWindow(b.session).start.getTime(),
    )
    .slice(0, limit);
  const [hosts, seats, hostProfiles] = await Promise.all([
    findUsersByIds(db, [...new Set(upcoming.map((e) => e.session.hostUserId))]),
    Promise.all(upcoming.map((e) => listLiveBookingsForSession(db, e.sessionId))),
    Promise.all(upcoming.map((e) => findMentorProfile(db, e.session.hostUserId))),
  ]);
  const hostName = new Map(hosts.map((h) => [h.id, h.displayName]));
  return upcoming.map((event, index) => {
    const { start, end } = sessionWindow(event.session);
    const profile = hostProfiles[index];
    return {
      slug: event.slug,
      title: event.title,
      start,
      end,
      hostName: hostName.get(event.session.hostUserId) ?? "A mentor",
      hostUserId: event.session.hostUserId,
      hostSlug: profile?.isListed ? profile.slug : null,
      seatsLeft: Math.max(0, event.session.capacity - seats[index]!.length),
      capacity: event.session.capacity,
    };
  });
}

/**
 * Everything the home page shows is live data (docs/22 §9: no invented numbers or placeholder
 * people). Sections with nothing real to show are omitted by the page.
 */
export async function loadHomeData(db: Database, now: Date) {
  const [{ mentors }, events, guides] = await Promise.all([
    searchMentors(db, { limit: CANDIDATE_POOL, offset: 0 }),
    loadEventTeasers(db, now, 3),
    listPublishedArticles(db, { limit: 3, offset: 0 }),
  ]);

  const cards = (
    await loadMentorCards(
      db,
      mentors.map((m) => m.userId),
    )
  )
    .filter((card) => card.isListed)
    .sort(byStrength);

  // Shortest names first: the strip reads as a list of places, not a wall of official titles.
  const organizations = [
    ...new Set(
      cards
        .filter((card) => card.affiliation?.verifiedAt && card.affiliation.organizationName)
        .map((card) => card.affiliation!.organizationName!),
    ),
  ].sort((a, b) => a.length - b.length);

  const guideTeasers: GuideTeaser[] = guides.articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    dek: article.dek,
    lastVerifiedAt: article.lastVerifiedAt,
    countryIso2: article.countryIso2,
  }));

  return {
    featured: cards.slice(0, 6),
    heroMentors: cards.slice(0, 3),
    organizations: organizations.slice(0, 8),
    events,
    guides: guideTeasers,
  };
}

import type { Database } from "@/server/platform/db/client";
import { findUsersByIds } from "@/server/modules/auth";
import { findMentorProfile, type MentorProfileRow } from "../infra/mentor-repo";
import { searchMentors as searchMentorsRepo, type SearchFilters } from "../infra/search-repo";

export type MentorCard = {
  userId: string;
  slug: string;
  displayName: string;
  headline: string | null;
  countryIso2: string | null;
};

export type SearchResults = { mentors: MentorCard[]; total: number };

/** Public explore listing (docs/22 J1): listed mentors only, ranked by recency until Phase 7/10 data exists. */
export async function searchMentors(db: Database, filters: SearchFilters): Promise<SearchResults> {
  const results = await searchMentorsRepo(db, filters);
  if (results.length === 0) return { mentors: [], total: 0 };

  const mentorUserIds = results.map((r) => r.mentorUserId);
  const countryByMentor = new Map(results.map((r) => [r.mentorUserId, r.countryIso2]));
  const [users, profiles] = await Promise.all([
    findUsersByIds(db, mentorUserIds),
    Promise.all(mentorUserIds.map((id) => findMentorProfile(db, id))),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const profileById = new Map<string, MentorProfileRow>();
  for (const profile of profiles) if (profile) profileById.set(profile.userId, profile);

  const mentors: MentorCard[] = mentorUserIds
    .map((id) => {
      const user = userById.get(id);
      const profile = profileById.get(id);
      if (!user || !profile) return null;
      return {
        userId: id,
        slug: profile.slug,
        displayName: user.displayName,
        headline: profile.headline,
        countryIso2: countryByMentor.get(id) ?? user.countryIso2,
      };
    })
    .filter((m): m is MentorCard => m !== null);

  return { mentors, total: results[0]?.total ?? mentors.length };
}

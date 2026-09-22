import { inArray } from "drizzle-orm";
import type { Database } from "@/server/platform/db/client";
import { findUserById } from "@/server/modules/auth";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { companies, universities } from "@/server/platform/db/tables/geo";
import { listAffiliations, type MentorAffiliationRow } from "../infra/affiliation-repo";
import { listExpertise, listLanguages, listLinks, type MentorLinkRow } from "../infra/details-repo";
import { latestAttestation } from "../infra/eligibility-repo";
import {
  findMentorProfile,
  findMentorProfileBySlug,
  type MentorProfileRow,
} from "../infra/mentor-repo";
import { findStats, type MentorStatsRow } from "../infra/stats-repo";
import type { LanguageProficiency } from "../infra/tables";

export type AffiliationDetail = MentorAffiliationRow & {
  organizationName: string | null;
  organizationSlug: string | null;
};

export type TermDetail = { id: string; slug: string; name: string };
export type LanguageDetail = TermDetail & { proficiency: LanguageProficiency };

export type MentorProfileDetail = {
  profile: MentorProfileRow;
  displayName: string;
  countryIso2: string | null;
  affiliations: AffiliationDetail[];
  expertise: TermDetail[];
  languages: LanguageDetail[];
  links: MentorLinkRow[];
  stats: MentorStatsRow | undefined;
};

async function assembleDetail(
  db: Database,
  profile: MentorProfileRow,
): Promise<MentorProfileDetail | null> {
  const user = await findUserById(db, profile.userId);
  if (!user) return null;

  const [affiliations, expertiseIds, languageRows, links, stats, attestation] = await Promise.all([
    listAffiliations(db, profile.userId),
    listExpertise(db, profile.userId),
    listLanguages(db, profile.userId),
    listLinks(db, profile.userId),
    findStats(db, profile.userId),
    latestAttestation(db, profile.userId),
  ]);

  const universityIds = affiliations
    .map((a) => a.universityId)
    .filter((id): id is string => id !== null);
  const companyIds = affiliations.map((a) => a.companyId).filter((id): id is string => id !== null);
  const languageIds = languageRows.map((l) => l.termId);
  const allTermIds = [...new Set([...expertiseIds, ...languageIds])];

  const [universityRows, companyRows, termRows] = await Promise.all([
    universityIds.length
      ? db
          .select({ id: universities.id, name: universities.name, slug: universities.slug })
          .from(universities)
          .where(inArray(universities.id, universityIds))
      : Promise.resolve([]),
    companyIds.length
      ? db
          .select({ id: companies.id, name: companies.name, slug: companies.slug })
          .from(companies)
          .where(inArray(companies.id, companyIds))
      : Promise.resolve([]),
    allTermIds.length
      ? db
          .select({ id: taxonomyTerms.id, name: taxonomyTerms.name, slug: taxonomyTerms.slug })
          .from(taxonomyTerms)
          .where(inArray(taxonomyTerms.id, allTermIds))
      : Promise.resolve([]),
  ]);

  const universityById = new Map(universityRows.map((r) => [r.id, r]));
  const companyById = new Map(companyRows.map((r) => [r.id, r]));
  const termById = new Map(termRows.map((r) => [r.id, r]));

  const affiliationDetails: AffiliationDetail[] = affiliations.map((a) => {
    const org = a.universityId
      ? universityById.get(a.universityId)
      : a.companyId
        ? companyById.get(a.companyId)
        : undefined;
    return { ...a, organizationName: org?.name ?? null, organizationSlug: org?.slug ?? null };
  });

  const expertise: TermDetail[] = expertiseIds
    .map((id) => termById.get(id))
    .filter((t): t is { id: string; name: string; slug: string } => t !== undefined);

  const languages: LanguageDetail[] = languageRows
    .map((l) => {
      const term = termById.get(l.termId);
      return term ? { ...term, proficiency: l.proficiency } : null;
    })
    .filter((t): t is LanguageDetail => t !== null);

  return {
    profile,
    displayName: user.displayName,
    countryIso2: attestation?.countryIso2 ?? user.countryIso2,
    affiliations: affiliationDetails,
    expertise,
    languages,
    links,
    stats,
  };
}

export async function getMentorProfileDetail(
  db: Database,
  mentorUserId: string,
): Promise<MentorProfileDetail | null> {
  const profile = await findMentorProfile(db, mentorUserId);
  if (!profile) return null;
  return assembleDetail(db, profile);
}

export async function getMentorProfileDetailBySlug(
  db: Database,
  slug: string,
): Promise<MentorProfileDetail | null> {
  const profile = await findMentorProfileBySlug(db, slug);
  if (!profile) return null;
  return assembleDetail(db, profile);
}

import { inArray } from "drizzle-orm";
import type { Database, Executor } from "@/server/platform/db/client";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { companies, universities } from "@/server/platform/db/tables/geo";
import { findUserById, hasActiveRestriction } from "@/server/modules/auth";
import { isListable } from "../domain/listing";
import { listAffiliations } from "../infra/affiliation-repo";
import { listExpertise, listLanguages } from "../infra/details-repo";
import { latestAttestation } from "../infra/eligibility-repo";
import { findMentorProfile, setListingState } from "../infra/mentor-repo";
import { upsertSearchDocument } from "../infra/search-repo";

/**
 * Recomputes whether a mentor is listed and rebuilds their search document. Called after anything
 * that changes a listed fact: profile edits, affiliation/expertise/language changes, or (from the
 * verification module) a credential being approved or revoked.
 *
 * `activeCredentialCount` is owned by the verification module, not readable from here (it would be a
 * circular module dependency). When the verification module calls this after a credential changes, it
 * passes the new count and we persist it. When profiles calls this after its own edits (bio, expertise,
 * ...), it omits the count and we reuse the last one persisted — an edit never has to guess and can
 * never accidentally un-list an already-verified mentor.
 */
export async function recomputeListingEligibility(
  executor: Executor,
  mentorUserId: string,
  activeCredentialCount?: number,
  now: Date = new Date(),
): Promise<void> {
  const profile = await findMentorProfile(executor, mentorUserId);
  if (!profile) return;

  const count = activeCredentialCount ?? profile.activeCredentialCount;
  const listingRestricted = await hasActiveRestriction(
    executor,
    mentorUserId,
    "listing.visible",
    now,
  );
  const listed = isListable(profile.applicationStatus, count, listingRestricted);
  await setListingState(executor, mentorUserId, listed, count);

  const [affiliations, expertiseTermIds, languages, attestation, user] = await Promise.all([
    listAffiliations(executor, mentorUserId),
    listExpertise(executor, mentorUserId),
    listLanguages(executor, mentorUserId),
    latestAttestation(executor, mentorUserId),
    findUserById(executor, mentorUserId),
  ]);

  const universityIds = [
    ...new Set(affiliations.map((a) => a.universityId).filter((id): id is string => id !== null)),
  ];
  const companyIds = [
    ...new Set(affiliations.map((a) => a.companyId).filter((id): id is string => id !== null)),
  ];
  const languageIds = languages.map((l) => l.termId);

  const [universityRows, companyRows, expertiseRows, languageRows] = await Promise.all([
    universityIds.length
      ? executor
          .select({ id: universities.id, name: universities.name })
          .from(universities)
          .where(inArray(universities.id, universityIds))
      : Promise.resolve([]),
    companyIds.length
      ? executor
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(inArray(companies.id, companyIds))
      : Promise.resolve([]),
    expertiseTermIds.length
      ? executor
          .select({ id: taxonomyTerms.id, name: taxonomyTerms.name })
          .from(taxonomyTerms)
          .where(inArray(taxonomyTerms.id, expertiseTermIds))
      : Promise.resolve([]),
    languageIds.length
      ? executor
          .select({ id: taxonomyTerms.id, name: taxonomyTerms.name })
          .from(taxonomyTerms)
          .where(inArray(taxonomyTerms.id, languageIds))
      : Promise.resolve([]),
  ]);

  const searchText = [
    user?.displayName ?? "",
    profile.headline ?? "",
    profile.bioMd ?? "",
    ...universityRows.map((r) => r.name),
    ...companyRows.map((r) => r.name),
    ...expertiseRows.map((r) => r.name),
    ...languageRows.map((r) => r.name),
  ]
    .filter(Boolean)
    .join(" ");

  await upsertSearchDocument(executor, {
    mentorUserId,
    isListed: listed,
    countryIso2: attestation?.countryIso2 ?? user?.countryIso2 ?? null,
    universityIds,
    companyIds,
    categoryIds: expertiseTermIds,
    languageIds,
    searchText,
  });
}

/** Re-derives listing for a mentor using their current stored credential count (used outside a TX). */
export async function refreshListingFromCredentials(
  db: Database,
  mentorUserId: string,
  activeCredentialCount: number,
): Promise<void> {
  await db.transaction((tx) =>
    recomputeListingEligibility(tx, mentorUserId, activeCredentialCount),
  );
}

/** Called by `trust` right after applying or lifting a `listing.visible` restriction (docs/10 §7.3
 * `hide_profile`, reliability-ladder suspensions) so the change is reflected immediately rather than
 * waiting for the mentor's own next unrelated edit — reuses whatever credential count is already
 * persisted, matching `recomputeListingEligibility`'s own "omit the count, reuse the last one"
 * contract. */
export async function refreshMentorListing(
  executor: Executor,
  mentorUserId: string,
  now: Date = new Date(),
): Promise<void> {
  await recomputeListingEligibility(executor, mentorUserId, undefined, now);
}

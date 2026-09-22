import { inArray } from "drizzle-orm";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError, type FieldError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { grantRole } from "@/server/modules/auth";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { attestationExpiresAt, resolvePayoutMode } from "../domain/eligibility";
import { slugify } from "../domain/slug";
import {
  addAffiliation,
  findAffiliation,
  listAffiliations,
  removeAffiliation,
} from "../infra/affiliation-repo";
import {
  addLink,
  listLinks,
  listExpertise,
  listLanguages,
  removeLink,
  setExpertise,
  setLanguages,
} from "../infra/details-repo";
import { insertAttestation, latestAttestation } from "../infra/eligibility-repo";
import {
  decideMentorApplication,
  findMentorProfile,
  setPayoutMode,
  slugTaken,
  startMentorDraft,
  submitMentorApplication as submitMentorApplicationRow,
  updateMentorProfileContent,
} from "../infra/mentor-repo";
import { ensureStatsRow } from "../infra/stats-repo";
import type {
  AffiliationKind,
  LanguageProficiency,
  MentorLinkKind,
  PayoutMode,
  ResidencyStatus,
} from "../infra/tables";
import { recomputeListingEligibility } from "./search-index";

async function uniqueSlug(db: Database, base: string): Promise<string> {
  const root = slugify(base) || "mentor";
  let candidate = root;
  let suffix = 1;
  while (await slugTaken(db, candidate)) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  return candidate;
}

/** Every mutation below depends on the draft profile row existing (FK target) — fail with a clean error, not a DB constraint violation. */
async function requireMentorProfile(db: Database, userId: string) {
  const profile = await findMentorProfile(db, userId);
  if (!profile) {
    throw new AppError("BAD_REQUEST", { detail: "Start a mentor application first." });
  }
  return profile;
}

export async function startMentorApplication(
  db: Database,
  userId: string,
  displayName: string,
): Promise<{ slug: string }> {
  const existing = await findMentorProfile(db, userId);
  if (existing) return { slug: existing.slug };

  const slug = await uniqueSlug(db, displayName);
  return db.transaction(async (tx) => {
    const profile = await startMentorDraft(tx, userId, slug);
    await ensureStatsRow(tx, userId);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "mentor_application.started",
      targetType: "user",
      targetId: userId,
    });
    return { slug: profile.slug };
  });
}

export async function updateMentorContent(
  db: Database,
  userId: string,
  input: { headline?: string; bioMd?: string },
): Promise<void> {
  await updateMentorProfileContent(db, userId, input);
  await recomputeListingEligibility(db, userId);
}

export type AffiliationInput = {
  kind: AffiliationKind;
  universityId?: string;
  companyId?: string;
  programId?: string;
  title: string;
  isCurrent: boolean;
  startDate?: string;
  endDate?: string;
};

export async function addMentorAffiliation(db: Database, userId: string, input: AffiliationInput) {
  await requireMentorProfile(db, userId);

  const errors: FieldError[] = [];
  if (input.kind === "education" && !input.universityId) {
    errors.push({ path: "universityId", code: "required", message: "Select a university." });
  }
  if (input.kind === "work" && !input.companyId) {
    errors.push({ path: "companyId", code: "required", message: "Select a company." });
  }
  if (errors.length > 0) throw new AppError("VALIDATION_FAILED", { errors });

  const row = await addAffiliation(db, {
    mentorUserId: userId,
    kind: input.kind,
    universityId: input.kind === "education" ? (input.universityId ?? null) : null,
    companyId: input.kind === "work" ? (input.companyId ?? null) : null,
    programId: input.programId ?? null,
    title: input.title.trim(),
    isCurrent: input.isCurrent,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
  });
  return row;
}

export async function removeMentorAffiliation(
  db: Database,
  userId: string,
  affiliationId: string,
): Promise<void> {
  const affiliation = await findAffiliation(db, affiliationId);
  if (!affiliation || affiliation.mentorUserId !== userId) throw new AppError("NOT_FOUND");
  await removeAffiliation(db, affiliationId, userId);
}

async function validateTermIds(
  db: Database,
  vocabulary: "category" | "language",
  termIds: string[],
): Promise<void> {
  if (termIds.length === 0) return;
  const rows = await db
    .select({ id: taxonomyTerms.id })
    .from(taxonomyTerms)
    .where(inArray(taxonomyTerms.id, termIds));
  const found = new Set(rows.map((r) => r.id));
  const missing = termIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new AppError("VALIDATION_FAILED", {
      errors: missing.map((id) => ({
        path: vocabulary,
        code: "not_found",
        message: `Unknown ${vocabulary} term: ${id}`,
      })),
    });
  }
}

export async function setMentorExpertise(
  db: Database,
  userId: string,
  termIds: string[],
): Promise<void> {
  await requireMentorProfile(db, userId);
  await validateTermIds(db, "category", termIds);
  await setExpertise(db, userId, termIds);
  await recomputeListingEligibility(db, userId);
}

export type LanguageInput = { termId: string; proficiency: LanguageProficiency };

export async function setMentorLanguages(
  db: Database,
  userId: string,
  languages: LanguageInput[],
): Promise<void> {
  await requireMentorProfile(db, userId);
  await validateTermIds(
    db,
    "language",
    languages.map((l) => l.termId),
  );
  await setLanguages(db, userId, languages);
}

export async function addMentorLink(
  db: Database,
  userId: string,
  kind: MentorLinkKind,
  url: string,
) {
  await requireMentorProfile(db, userId);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "url", code: "invalid_url", message: "Enter a valid URL." }],
    });
  }
  if (parsed.protocol !== "https:") {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "url", code: "invalid_url", message: "Links must use https://." }],
    });
  }
  return addLink(db, userId, kind, parsed.toString());
}

export async function removeMentorLink(
  db: Database,
  userId: string,
  linkId: string,
): Promise<void> {
  await removeLink(db, linkId, userId);
}

export async function submitEligibilityAttestation(
  db: Database,
  userId: string,
  input: { countryIso2: string; residencyStatus: ResidencyStatus },
  deps: { clock: Clock },
): Promise<{ payoutMode: PayoutMode }> {
  await requireMentorProfile(db, userId);
  const now = deps.clock.now();
  const rules = await getSetting(db, "mentor_eligibility.country_rules", now);
  const reattestDays = await getSetting(db, "mentor.eligibility_reattest_days", now);
  const payoutMode = resolvePayoutMode(input.countryIso2, input.residencyStatus, rules);
  const expiresAt = attestationExpiresAt(now, reattestDays);

  await db.transaction(async (tx) => {
    await insertAttestation(tx, {
      mentorUserId: userId,
      countryIso2: input.countryIso2,
      residencyStatus: input.residencyStatus,
      payoutModeResult: payoutMode,
      attestedAt: now,
      expiresAt,
    });
    await setPayoutMode(tx, userId, payoutMode);
    await recomputeListingEligibility(tx, userId);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "mentor_application.eligibility_attested",
      targetType: "user",
      targetId: userId,
      metadata: {
        countryIso2: input.countryIso2,
        residencyStatus: input.residencyStatus,
        payoutMode,
      },
    });
  });
  return { payoutMode };
}

export type ApplicationCompleteness = { complete: boolean; missing: string[] };

export async function checkApplicationCompleteness(
  db: Database,
  userId: string,
): Promise<ApplicationCompleteness> {
  const profile = await findMentorProfile(db, userId);
  const missing: string[] = [];
  if (!profile?.headline) missing.push("headline");
  if (!profile?.bioMd) missing.push("bio");
  const affiliations = await listAffiliations(db, userId);
  if (affiliations.length === 0) missing.push("affiliations");
  const expertise = await listExpertise(db, userId);
  if (expertise.length === 0) missing.push("expertise");
  const languages = await listLanguages(db, userId);
  if (languages.length === 0) missing.push("languages");
  const attestation = await latestAttestation(db, userId);
  if (!attestation) missing.push("eligibility");
  return { complete: missing.length === 0, missing };
}

export async function submitMentorApplication(
  db: Database,
  userId: string,
  clock: Clock,
): Promise<void> {
  const profile = await findMentorProfile(db, userId);
  if (!profile) throw new AppError("NOT_FOUND");
  if (profile.applicationStatus !== "draft") {
    throw new AppError("INVALID_STATE_TRANSITION", {
      detail: "This application was already submitted.",
    });
  }
  const completeness = await checkApplicationCompleteness(db, userId);
  if (!completeness.complete) {
    throw new AppError("VALIDATION_FAILED", {
      errors: completeness.missing.map((section) => ({
        path: section,
        code: "incomplete",
        message: `Complete the ${section} section before submitting.`,
      })),
    });
  }

  const now = clock.now();
  await db.transaction(async (tx) => {
    await submitMentorApplicationRow(tx, userId, now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "mentor_application.submitted",
      targetType: "user",
      targetId: userId,
    });
  });
}

export type ApplicationDecision = "approved" | "rejected" | "paused";

export async function reviewMentorApplication(
  db: Database,
  staffUserId: string,
  mentorUserId: string,
  decision: ApplicationDecision,
  clock: Clock,
  rejectionReason?: string,
): Promise<void> {
  const profile = await findMentorProfile(db, mentorUserId);
  if (!profile) throw new AppError("NOT_FOUND");
  const now = clock.now();

  await db.transaction(async (tx) => {
    await decideMentorApplication(tx, mentorUserId, {
      status: decision,
      reviewedBy: staffUserId,
      now,
      rejectionReason,
    });
    if (decision === "approved") await grantRole(tx, mentorUserId, "mentor", staffUserId);
    // No explicit count: reuses whatever the verification module last reported. `isListable` already
    // requires status === 'approved', so 'rejected'/'paused' naturally resolve to unlisted regardless.
    await recomputeListingEligibility(tx, mentorUserId);
    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: staffUserId,
      action: `mentor_application.${decision}`,
      targetType: "user",
      targetId: mentorUserId,
      metadata: rejectionReason ? { reason: rejectionReason } : {},
    });
  });
}

export async function listMentorLinksFor(db: Database, userId: string) {
  return listLinks(db, userId);
}

import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/server/modules/auth";
import { appSchema } from "@/server/platform/db/tables/platform";
import { countries, taxonomyTerms } from "@/server/platform/db/tables/reference";
import { companies, programs, universities } from "@/server/platform/db/tables/geo";
import { checkIn, tsvectorColumn } from "@/server/platform/db/sql-helpers";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const STUDENT_VISIBILITIES = ["public", "logged_in", "booked_mentors_only"] as const;
export type StudentVisibility = (typeof STUDENT_VISIBILITIES)[number];

export const studentProfiles = appSchema.table(
  "student_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    visibility: text("visibility").$type<StudentVisibility>().notNull().default("logged_in"),
    headline: text("headline"),
    bioMd: text("bio_md"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("student_profiles_visibility_valid", checkIn("visibility", STUDENT_VISIBILITIES))],
);

export {
  MENTOR_APPLICATION_STATUSES,
  PAYOUT_MODES,
  RESIDENCY_STATUSES,
  type MentorApplicationStatus,
  type PayoutMode,
  type ResidencyStatus,
} from "../domain/types";
import type { MentorApplicationStatus, PayoutMode, ResidencyStatus } from "../domain/types";
import { MENTOR_APPLICATION_STATUSES, PAYOUT_MODES, RESIDENCY_STATUSES } from "../domain/types";

/** A mentor profile exists (in `draft`) the moment someone starts the application (docs/01 J2). */
export const mentorProfiles = appSchema.table(
  "mentor_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique("mentor_profiles_slug_unique"),
    headline: text("headline"),
    bioMd: text("bio_md"),
    applicationStatus: text("application_status")
      .$type<MentorApplicationStatus>()
      .notNull()
      .default("draft"),
    payoutMode: text("payout_mode").$type<PayoutMode>().notNull().default("volunteer"),
    /** True only once approved, not paused, and meeting the listing-eligibility rule (docs/10 §2.1). */
    isListed: boolean("is_listed").notNull().default(false),
    /**
     * Denormalised from the verification module (which owns credentials): the verification module
     * pushes the count in whenever it changes; profiles reads it back for recomputes triggered by its
     * own edits (bio, expertise, ...) so a routine edit never has to guess and accidentally un-list a
     * verified mentor.
     */
    activeCredentialCount: integer("active_credential_count").notNull().default(0),
    /** Public search-indexing opt-out, default on (docs/22 §10.1). */
    searchIndexable: boolean("search_indexable").notNull().default(true),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    reviewedBy: uuid("reviewed_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "mentor_profiles_status_valid",
      checkIn("application_status", MENTOR_APPLICATION_STATUSES),
    ),
    check("mentor_profiles_payout_mode_valid", checkIn("payout_mode", PAYOUT_MODES)),
    check("mentor_profiles_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    index("mentor_profiles_listed_idx").on(t.isListed),
  ],
);

export const AFFILIATION_KINDS = ["education", "work"] as const;
export type AffiliationKind = (typeof AFFILIATION_KINDS)[number];

export const mentorAffiliations = appSchema.table(
  "mentor_affiliations",
  {
    id: uuid("id").primaryKey(),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    kind: text("kind").$type<AffiliationKind>().notNull(),
    universityId: uuid("university_id").references(() => universities.id),
    companyId: uuid("company_id").references(() => companies.id),
    programId: uuid("program_id").references(() => programs.id),
    title: text("title").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("mentor_affiliations_kind_valid", checkIn("kind", AFFILIATION_KINDS)),
    check(
      "mentor_affiliations_target_matches_kind",
      sql`(kind = 'education' AND ${t.universityId} IS NOT NULL AND ${t.companyId} IS NULL) OR (kind = 'work' AND ${t.companyId} IS NOT NULL AND ${t.universityId} IS NULL)`,
    ),
    index("mentor_affiliations_mentor_idx").on(t.mentorUserId),
    index("mentor_affiliations_university_idx").on(t.universityId),
    index("mentor_affiliations_company_idx").on(t.companyId),
  ],
);

export const mentorExpertise = appSchema.table(
  "mentor_expertise",
  {
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => taxonomyTerms.id),
  },
  (t) => [
    primaryKey({ columns: [t.mentorUserId, t.termId] }),
    index("mentor_expertise_term_idx").on(t.termId),
  ],
);

export const LANGUAGE_PROFICIENCIES = ["native", "fluent", "conversational"] as const;
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number];

export const mentorLanguages = appSchema.table(
  "mentor_languages",
  {
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => taxonomyTerms.id),
    proficiency: text("proficiency").$type<LanguageProficiency>().notNull().default("fluent"),
  },
  (t) => [
    primaryKey({ columns: [t.mentorUserId, t.termId] }),
    check("mentor_languages_proficiency_valid", checkIn("proficiency", LANGUAGE_PROFICIENCIES)),
  ],
);

export const MENTOR_LINK_KINDS = [
  "website",
  "linkedin",
  "github",
  "twitter",
  "portfolio",
  "other",
] as const;
export type MentorLinkKind = (typeof MENTOR_LINK_KINDS)[number];

export const mentorLinks = appSchema.table(
  "mentor_links",
  {
    id: uuid("id").primaryKey(),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    kind: text("kind").$type<MentorLinkKind>().notNull(),
    url: text("url").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("mentor_links_kind_valid", checkIn("kind", MENTOR_LINK_KINDS)),
    check("mentor_links_url_scheme", sql`${t.url} ~ '^https://'`),
    index("mentor_links_mentor_idx").on(t.mentorUserId),
  ],
);

/** Append-only: a new row per (re-)attestation, never edited (docs/10 §3.1). */
export const mentorEligibilityAttestations = appSchema.table(
  "mentor_eligibility_attestations",
  {
    id: uuid("id").primaryKey(),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    countryIso2: char("country_iso2", { length: 2 })
      .notNull()
      .references(() => countries.iso2),
    residencyStatus: text("residency_status").$type<ResidencyStatus>().notNull(),
    payoutModeResult: text("payout_mode_result").$type<PayoutMode>().notNull(),
    attestedAt: timestamp("attested_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "mentor_eligibility_residency_status_valid",
      checkIn("residency_status", RESIDENCY_STATUSES),
    ),
    check("mentor_eligibility_payout_mode_valid", checkIn("payout_mode_result", PAYOUT_MODES)),
    index("mentor_eligibility_mentor_idx").on(t.mentorUserId, t.attestedAt),
  ],
);

/** Aggregates updated by later phases (booking/reviews); zeroed until then (docs/05 §3.1). */
export const mentorStats = appSchema.table("mentor_stats", {
  mentorUserId: uuid("mentor_user_id")
    .primaryKey()
    .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
  sessionsCompleted: integer("sessions_completed").notNull().default(0),
  reliabilityPct: integer("reliability_pct").notNull().default(100),
  reviewCount: integer("review_count").notNull().default(0),
  avgRating: numeric("avg_rating", { precision: 3, scale: 2 }),
  updatedAt: updatedAt(),
});

export const savedMentors = appSchema.table(
  "saved_mentors",
  {
    studentUserId: uuid("student_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.studentUserId, t.mentorUserId] }),
    index("saved_mentors_mentor_idx").on(t.mentorUserId),
  ],
);

/**
 * Denormalised search index (docs/05 §5), rebuilt whenever a listed mentor's facts change. Only the
 * facets this phase actually has data for: price and ranking-score columns land with Phase 7/10.
 */
export const mentorSearchDocuments = appSchema.table(
  "mentor_search_documents",
  {
    mentorUserId: uuid("mentor_user_id")
      .primaryKey()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    isListed: boolean("is_listed").notNull().default(false),
    countryIso2: char("country_iso2", { length: 2 }),
    universityIds: uuid("university_ids").array().notNull().default([]),
    companyIds: uuid("company_ids").array().notNull().default([]),
    categoryIds: uuid("category_ids").array().notNull().default([]),
    languageIds: uuid("language_ids").array().notNull().default([]),
    tsv: tsvectorColumn("tsv").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("mentor_search_documents_tsv_idx").using("gin", t.tsv),
    index("mentor_search_documents_university_idx").using("gin", t.universityIds),
    index("mentor_search_documents_company_idx").using("gin", t.companyIds),
    index("mentor_search_documents_category_idx").using("gin", t.categoryIds),
    index("mentor_search_documents_language_idx").using("gin", t.languageIds),
    index("mentor_search_documents_listed_idx").on(t.isListed),
  ],
);

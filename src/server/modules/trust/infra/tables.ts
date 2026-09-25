import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/server/modules/auth";
import { bookings } from "@/server/modules/booking";
import { mentorProfiles } from "@/server/modules/profiles";
import { appSchema } from "@/server/platform/db/tables/platform";
import { checkIn } from "@/server/platform/db/sql-helpers";
import {
  APPEAL_STATUSES,
  DISPUTE_EVIDENCE_KINDS,
  DISPUTE_RESOLUTIONS,
  DISPUTE_STATUSES,
  MODERATION_ACTION_TYPES,
  MODERATION_CASE_STATUSES,
  REPORT_REASON_CODES,
  REPORT_TARGET_TYPES,
  REVIEW_STATUSES,
  TRUST_EVENT_TYPES,
} from "../domain/types";
import type {
  AppealStatus,
  DisputeEvidenceKind,
  DisputeResolution,
  DisputeStatus,
  ModerationActionType,
  ModerationCaseStatus,
  ReportReasonCode,
  ReportTargetType,
  ReviewStatus,
  TrustEventType,
} from "../domain/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** docs/05 §3.5 ERD — fully specified. */
export const trustEvents = appSchema.table(
  "trust_events",
  {
    id: uuid("id").primaryKey(),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<TrustEventType>().notNull(),
    points: integer("points").notNull(),
    excused: boolean("excused").notNull().default(false),
    excuseReason: text("excuse_reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** null = never decays (docs/10 §4.2 `verification_fraud`). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** What produced this event — an `audit_logs` row id from the ingestion poller, a report id, a
     * dispute id, etc. Plain text + uuid rather than a real FK: sources span multiple tables (and
     * `audit_logs.id` is a bigint, not a uuid), matching the same "polymorphic reference, no FK"
     * shape already used for `order_items.booking_id` (ADR-029). */
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    createdAt: createdAt(),
  },
  (t) => [
    check("trust_events_type_valid", checkIn("type", TRUST_EVENT_TYPES)),
    check("trust_events_points_non_negative", sql`${t.points} >= 0`),
    index("trust_events_subject_idx").on(t.subjectUserId, t.occurredAt),
    uniqueIndex("trust_events_source_unique").on(t.sourceType, t.sourceId, t.type),
  ],
);

export const reports = appSchema.table(
  "reports",
  {
    id: uuid("id").primaryKey(),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => users.id),
    targetType: text("target_type").$type<ReportTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    reasonCode: text("reason_code").$type<ReportReasonCode>().notNull(),
    details: text("details"),
    caseId: uuid("case_id"),
    createdAt: createdAt(),
  },
  (t) => [
    check("reports_target_type_valid", checkIn("target_type", REPORT_TARGET_TYPES)),
    check("reports_reason_code_valid", checkIn("reason_code", REPORT_REASON_CODES)),
    index("reports_target_idx").on(t.targetType, t.targetId, t.createdAt),
    // Same reporter, same target, inside a short window collapses to one row rather than a flood
    // (docs/18 X3 "coordinated fake reports... no automatic sanction from count alone" — this is
    // the reporter-level dedup docs/10 §7.1 leaves unspecified; see this phase's own ADR).
    index("reports_reporter_target_idx").on(t.reporterUserId, t.targetType, t.targetId),
  ],
);

export const moderationCases = appSchema.table(
  "moderation_cases",
  {
    id: uuid("id").primaryKey(),
    status: text("status").$type<ModerationCaseStatus>().notNull().default("open"),
    targetType: text("target_type").$type<ReportTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    /** The `policy_rules.id` that proposed this case, when it wasn't opened from a user report
     * (docs/10 §4.1 "otherwise -> CASE: proposed action"). */
    proposedByRuleId: uuid("proposed_by_rule_id"),
    assignedTo: uuid("assigned_to"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("moderation_cases_status_valid", checkIn("status", MODERATION_CASE_STATUSES)),
    index("moderation_cases_target_idx").on(t.targetType, t.targetId),
    index("moderation_cases_status_idx").on(t.status),
  ],
);

/** A simple append-only timeline (docs/10 §7.2) — real content (reports, trust events, prior
 * actions) is referenced by id in `payload`, not duplicated; messages aren't a source this phase
 * since no messaging module exists yet (docs/19 Phase 10 retrospective deviation). */
export const moderationCaseEvents = appSchema.table(
  "moderation_case_events",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => moderationCases.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("moderation_case_events_case_idx").on(t.caseId, t.createdAt)],
);

/** docs/05 §3.5 ERD — fully specified (`action` CHECK, `restriction_scope jsonb`, etc.). */
export const moderationActions = appSchema.table(
  "moderation_actions",
  {
    id: uuid("id").primaryKey(),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").$type<ModerationActionType>().notNull(),
    restrictionScope: jsonb("restriction_scope")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    reasonCode: text("reason_code").notNull(),
    rationale: text("rationale"),
    caseId: uuid("case_id"),
    decidedBy: uuid("decided_by"),
    secondReviewerId: uuid("second_reviewer_id"),
    createdAt: createdAt(),
  },
  (t) => [
    check("moderation_actions_action_valid", checkIn("action", MODERATION_ACTION_TYPES)),
    index("moderation_actions_subject_idx").on(t.subjectUserId, t.createdAt),
  ],
);

export const appeals = appSchema.table(
  "appeals",
  {
    id: uuid("id").primaryKey(),
    moderationActionId: uuid("moderation_action_id")
      .notNull()
      .references(() => moderationActions.id, { onDelete: "cascade" }),
    appellantUserId: uuid("appellant_user_id")
      .notNull()
      .references(() => users.id),
    statement: text("statement").notNull(),
    status: text("status").$type<AppealStatus>().notNull().default("open"),
    reviewerId: uuid("reviewer_id"),
    /** True when the same staff member who decided the original action also reviewed the appeal
     * (docs/10 §7.4 "otherwise flagged `single_staff_review` for later audit") — this project's own
     * documented single-staff-operation reality (docs/19 founder action items). */
    singleStaffReview: boolean("single_staff_review").notNull().default(false),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("appeals_status_valid", checkIn("status", APPEAL_STATUSES)),
    // One appeal per action (docs/10 §7.4).
    uniqueIndex("appeals_one_per_action").on(t.moderationActionId),
  ],
);

/** `ruleBody` mirrors `domain/policy-evaluator.ts`'s `PolicyRuleBody` shape (docs/10 §4.3's
 * worked JSON example) — structured columns for what's always scalar, `rule_body jsonb` for the
 * variable `anyOf`/`restrictions` shape, matching `commission_rules`' own precedent (Phase 8). */
export const policyRules = appSchema.table(
  "policy_rules",
  {
    id: uuid("id").primaryKey(),
    ruleKey: text("rule_key").notNull().unique("policy_rules_rule_key_unique"),
    subjectRole: text("subject_role").$type<"mentor" | "student" | "any">().notNull(),
    ruleBody: jsonb("rule_body").$type<Record<string, unknown>>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("policy_rules_subject_role_valid", checkIn("subject_role", ["mentor", "student", "any"])),
    index("policy_rules_subject_idx").on(t.subjectRole, t.enabled),
  ],
);

export const disputes = appSchema.table(
  "disputes",
  {
    id: uuid("id").primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique("disputes_booking_unique")
      .references(() => bookings.id),
    status: text("status").$type<DisputeStatus>().notNull().default("open"),
    openedByUserId: uuid("opened_by_user_id")
      .notNull()
      .references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    evidenceDeadlineAt: timestamp("evidence_deadline_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution").$type<DisputeResolution>(),
    refundPct: integer("refund_pct"),
    atFaultUserId: uuid("at_fault_user_id"),
    decidedBy: uuid("decided_by"),
    appealDeadlineAt: timestamp("appeal_deadline_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("disputes_status_valid", checkIn("status", DISPUTE_STATUSES)),
    check(
      "disputes_resolution_valid",
      sql`${t.resolution} IS NULL OR ${checkIn("resolution", DISPUTE_RESOLUTIONS)}`,
    ),
    check(
      "disputes_refund_pct_range",
      sql`${t.refundPct} IS NULL OR ${t.refundPct} BETWEEN 0 AND 100`,
    ),
    index("disputes_status_idx").on(t.status),
  ],
);

export const disputeEvidence = appSchema.table(
  "dispute_evidence",
  {
    id: uuid("id").primaryKey(),
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => disputes.id, { onDelete: "cascade" }),
    submittedByUserId: uuid("submitted_by_user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").$type<DisputeEvidenceKind>().notNull(),
    /** Free-form content for note/claim/message_ref/signal_ref kinds; `screenshot` is accepted in
     * the enum but has no upload path this phase (no `ObjectStore` port yet — docs/10 §2.3 named the
     * same gap for verification documents in Phase 6, still open; documented Phase 10 deviation). */
    content: text("content"),
    createdAt: createdAt(),
  },
  (t) => [
    check("dispute_evidence_kind_valid", checkIn("kind", DISPUTE_EVIDENCE_KINDS)),
    index("dispute_evidence_dispute_idx").on(t.disputeId),
  ],
);

/** docs/05 §3.5 ERD + §4.6 DDL constraints — fully specified. */
export const reviews = appSchema.table(
  "reviews",
  {
    id: uuid("id").primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique("reviews_one_per_booking")
      .references(() => bookings.id),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    rating: smallint("rating").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<ReviewStatus>().notNull().default("pending"),
    heldReason: text("held_reason"),
    editWindowExpiresAt: timestamp("edit_window_expires_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("reviews_status_valid", checkIn("status", REVIEW_STATUSES)),
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    check("reviews_not_self", sql`${t.authorUserId} <> ${t.mentorUserId}`),
    index("reviews_mentor_idx").on(t.mentorUserId, t.status),
  ],
);

export const reviewResponses = appSchema.table(
  "review_responses",
  {
    id: uuid("id").primaryKey(),
    reviewId: uuid("review_id")
      .notNull()
      .unique("review_responses_one_per_review")
      .references(() => reviews.id, { onDelete: "cascade" }),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId),
    body: text("body").notNull(),
    status: text("status").$type<ReviewStatus>().notNull().default("pending"),
    heldReason: text("held_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("review_responses_status_valid", checkIn("status", REVIEW_STATUSES))],
);

/** Watermark for the audit-log ingestion poller (this phase's own design — see the trust-event
 * ingestion module) — a single row, not per-subject, since it just tracks "highest audit_logs.id
 * processed so far." */
export const trustIngestionWatermark = appSchema.table("trust_ingestion_watermark", {
  id: smallint("id").primaryKey().default(1),
  lastAuditLogId: bigint("last_audit_log_id", { mode: "number" }).notNull().default(0),
  updatedAt: updatedAt(),
});

/** Platform-mean rating cache for the Bayesian average's prior (docs/10 §10) — a single row,
 * recomputed by the same nightly job that recomputes mentor stats. */
export const platformRatingStats = appSchema.table("platform_rating_stats", {
  id: smallint("id").primaryKey().default(1),
  meanRating: numeric("mean_rating", { precision: 3, scale: 2 }).notNull().default("4.5"),
  updatedAt: updatedAt(),
});

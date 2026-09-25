/** Shared enums for the trust module (docs/05 §2 "Trust & safety"/"Reviews", docs/10). Domain-owned
 * so infra imports these, never the reverse. */

export const REPORT_REASON_CODES = [
  "harassment",
  "hate",
  "sexual_content",
  "minor_safety",
  "scam_fraud",
  "off_platform_payment",
  "impersonation",
  "fake_credentials",
  "spam",
  "misinformation_harmful",
  "intellectual_property",
  "privacy_violation",
  "other",
] as const;
export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

/** docs/10 §7.1's reportable-target prose list; "session" (its own wording) rather than "booking". */
export const REPORT_TARGET_TYPES = [
  "user",
  "mentor_profile",
  "message",
  "review",
  "review_response",
  "event",
  "session",
  "guide",
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const MODERATION_CASE_STATUSES = [
  "open",
  "assigned",
  "action_proposed",
  "decided",
  "closed",
] as const;
export type ModerationCaseStatus = (typeof MODERATION_CASE_STATUSES)[number];

/** docs/05 §3.5 ERD `moderation_actions.action` CHECK, verbatim list. */
export const MODERATION_ACTION_TYPES = [
  "warn",
  "restrict",
  "suspend",
  "ban",
  "reinstate",
  "remove_content",
  "hide_profile",
] as const;
export type ModerationActionType = (typeof MODERATION_ACTION_TYPES)[number];

/** docs/10 §7.3: only `warn` and `restrict` may ever be auto-applied; every other action is always
 * a human decision — a hard invariant the evaluator enforces itself, not just admin-UI convention. */
export const AUTO_APPLICABLE_ACTION_TYPES: ReadonlySet<ModerationActionType> = new Set([
  "warn",
  "restrict",
]);

export const APPEAL_STATUSES = ["open", "upheld", "modified", "overturned"] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const DISPUTE_STATUSES = [
  "open",
  "awaiting_evidence",
  "under_review",
  "resolved",
  "appealed",
  "closed",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_RESOLUTIONS = ["full_refund", "partial_refund", "no_refund"] as const;
export type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number];

export const DISPUTE_EVIDENCE_KINDS = [
  "screenshot",
  "message_ref",
  "claim",
  "signal_ref",
  "note",
] as const;
export type DisputeEvidenceKind = (typeof DISPUTE_EVIDENCE_KINDS)[number];

/** docs/05 §3.5 ERD `reviews.status` CHECK, verbatim list. */
export const REVIEW_STATUSES = ["pending", "published", "held", "removed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** docs/10 §4.2's full trust-event catalog. `off_platform_solicitation` is split into two literal
 * types (first/repeat carry different points, docs/10 §9) rather than one type with dynamic points,
 * so the catalog itself stays a flat lookup table — the application layer decides which literal type
 * a new occurrence is by checking the subject's history first. */
export const TRUST_EVENT_TYPES = [
  "mentor_no_show",
  "mentor_late_cancel_24h",
  "mentor_late_cancel_2h",
  "mentor_cancel_24_72h",
  "mentor_late_arrival_reported",
  "student_no_show",
  "free_event_no_show",
  "hold_abuse",
  "off_platform_solicitation_first",
  "off_platform_solicitation_repeat",
  "report_upheld_minor",
  "report_upheld_major",
  "chargeback_lost_friendly_fraud",
  "review_manipulation",
  "verification_fraud",
] as const;
export type TrustEventType = (typeof TRUST_EVENT_TYPES)[number];

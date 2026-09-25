/**
 * Public surface of the trust module (docs/05, docs/10, docs/19 Phase 10). Other modules and route
 * handlers depend only on this file — never on `application/*`, `domain/*` or `infra/*` directly.
 */

// --- Domain enums (route validation, display) ---
export {
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
  type AppealStatus,
  type DisputeEvidenceKind,
  type DisputeResolution,
  type DisputeStatus,
  type ModerationActionType,
  type ModerationCaseStatus,
  type ReportReasonCode,
  type ReportTargetType,
  type ReviewStatus,
  type TrustEventType,
} from "./domain/types";
export {
  TRUST_EVENT_CATALOG,
  pointsFor,
  expiresAt,
  type TrustEventCatalogEntry,
} from "./domain/catalog";

// --- Reports ---
export {
  createReport,
  listReportsForModerationCase,
  listRecentReports,
  type CreateReportInput,
} from "./application/reports";
export type { ReportRow } from "./infra/reports-repo";

// --- Moderation cases & enforcement ---
export {
  assignCaseToStaff,
  getCaseDetail,
  listModerationCases,
  decideCase,
  dismissCase,
  revokeModerationAction,
  excuseTrustEventById,
  getMyEnforcementStatus,
  type CaseDetail,
  type DecideCaseInput,
  type MyEnforcementStatus,
} from "./application/moderation";
export {
  applyModerationAction,
  reverseModerationAction,
  type ApplyActionInput,
} from "./application/enforcement";
export {
  listActionsForSubject,
  type ModerationActionRow,
  type ModerationCaseEventRow,
  type ModerationCaseRow,
} from "./infra/moderation-repo";

// --- Policy engine ---
export {
  runPolicyEngineForSubject,
  runPolicyEngineForBothLadders,
  type PolicyEngineOutcome,
} from "./application/policy-engine";
export { recordTrustEvent, type RecordTrustEventInput } from "./application/trust-event-recording";
export {
  ingestPendingAuditSignals,
  type IngestionSummary,
} from "./application/trust-event-ingestion";
export { seedPolicyRules } from "./application/seed-policy-rules";
export type { PolicyRuleRow } from "./infra/policy-rules-repo";
export type {
  PolicyCondition,
  PolicyRuleBody,
  SessionRateFact,
  TrustEventFact,
} from "./domain/policy-evaluator";
export type { TrustEventRow } from "./infra/trust-events-repo";

// --- Appeals ---
export {
  openAppeal,
  listAppealsForReview,
  decideAppeal,
  type DecideAppealInput,
} from "./application/appeals";
export type { AppealRow } from "./infra/appeals-repo";

// --- Disputes ---
export {
  openDispute,
  submitDisputeEvidence,
  listDisputeEvidence,
  getDisputeForParticipant,
  getDisputeForAdmin,
  listDisputesForAdmin,
  sweepDisputeEvidenceDeadlines,
  resolveDispute,
  appealDisputeResolution,
  sweepDisputeAppealDeadlines,
  decideDisputeAppeal,
  type ResolveDisputeInput,
  type DecideDisputeAppealInput,
} from "./application/disputes";
export type { DisputeEvidenceRow, DisputeRow } from "./infra/disputes-repo";

// --- Reviews ---
export {
  createReview,
  editReview,
  respondToReview,
  type CreateReviewInput,
} from "./application/reviews";
export {
  findReview,
  findReviewByBooking,
  findReviewResponse,
  listPublishedReviewsForMentor,
  type ReviewResponseRow,
  type ReviewRow,
} from "./infra/reviews-repo";

// --- Reliability / stats ---
export { recomputeMentorStats, recomputeAllMentorStats } from "./application/reliability";
export { bayesianAverage, computeReliabilityPct } from "./domain/reliability";

// --- Detectors (reused outside messaging: profile/service text, intake answers) ---
export {
  containsProfanity,
  detectClaimPhrases,
  detectContactInfo,
  hasPaymentSolicitation,
  shouldHoldForModeration,
  type ClaimPhraseHit,
  type ContactInfoHit,
  type ReviewPublicationCheck,
} from "./domain/detectors";

// --- Jobs ---
export { trustJobs, trustRecurringJobs } from "./application/jobs";

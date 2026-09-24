/** Shared enums for the booking module (docs/05 §3.3, docs/09 §7). Domain-owned so infra imports these, never the reverse. */

/** Only `one_on_one` is implemented this phase; `group`/`event` are Phase 9 (docs/19). */
export const SESSION_KINDS = ["one_on_one", "group", "event"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_STATUSES = ["scheduled", "cancelled", "completed", "under_review"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const BOOKING_STATUSES = [
  "held",
  "confirmed",
  "expired",
  "cancelled_by_student",
  "cancelled_by_mentor",
  "cancelled_by_admin",
  "cancelled_system",
  "awaiting_outcome",
  "completed",
  "no_show_mentor",
  "no_show_student",
  "disputed",
  "resolved_refunded",
  "payment_orphaned",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const RESCHEDULE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
] as const;
export type RescheduleStatus = (typeof RESCHEDULE_STATUSES)[number];

export const ATTENDANCE_SIGNAL_KINDS = ["join_click", "check_in"] as const;
export type AttendanceSignalKind = (typeof ATTENDANCE_SIGNAL_KINDS)[number];

export const ATTENDANCE_CLAIM_OUTCOMES = [
  "held",
  "mentor_absent",
  "student_absent",
  "technical_issue",
] as const;
export type AttendanceClaimOutcome = (typeof ATTENDANCE_CLAIM_OUTCOMES)[number];

export const CANCEL_ACTORS = ["student", "mentor", "admin", "system"] as const;
export type CancelActor = (typeof CANCEL_ACTORS)[number];

/** Phase 9: group-seat waitlist and free-event waitlist share one table and state shape (docs/09
 * §8/§9), even though the paid path uses `offered`/`claimed` (a claim step) and the free-event path
 * jumps straight from `waiting` to a confirmed booking (auto-promotion, no claim). */
export const WAITLIST_ENTRY_STATUSES = [
  "waiting",
  "offered",
  "claimed",
  "expired",
  "declined",
  "left",
] as const;
export type WaitlistEntryStatus = (typeof WAITLIST_ENTRY_STATUSES)[number];

export const EVENT_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const RECORDING_VISIBILITIES = ["attendees", "public"] as const;
export type RecordingVisibility = (typeof RECORDING_VISIBILITIES)[number];

export const BOOKING_ELIGIBILITY_REASONS = [
  "EMAIL_NOT_VERIFIED",
  "AGE_POLICY",
  "ACCOUNT_RESTRICTED",
  "SELF_BOOKING",
  "NOT_AVAILABLE",
  "MENTOR_UNAVAILABLE",
  "MENTOR_NOT_PAYABLE",
  "INVALID_DURATION",
  "TOO_SOON",
  "TOO_FAR",
  "OUTSIDE_AVAILABILITY",
  "DAILY_LIMIT",
  "TOO_MANY_HOLDS",
  "STUDENT_OVERLAP",
  "FREE_BOOKING_LIMIT",
] as const;
export type BookingEligibilityReason = (typeof BOOKING_ELIGIBILITY_REASONS)[number];

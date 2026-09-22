/** Shared vocabulary (docs/05 §3.1, docs/10 §3.1) — owned by the domain layer, mapped to storage by infra. */

export const MENTOR_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "paused",
] as const;
export type MentorApplicationStatus = (typeof MENTOR_APPLICATION_STATUSES)[number];

export const PAYOUT_MODES = ["volunteer", "paid"] as const;
export type PayoutMode = (typeof PAYOUT_MODES)[number];

export const RESIDENCY_STATUSES = [
  "citizen_or_pr",
  "work_authorised",
  "student_visa",
  "not_authorised",
  "other",
] as const;
export type ResidencyStatus = (typeof RESIDENCY_STATUSES)[number];

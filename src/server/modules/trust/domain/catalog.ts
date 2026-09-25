import type { TrustEventType } from "./types";

export type TrustEventCatalogEntry = {
  points: number;
  /** null = never decays (docs/10 §4.2 `verification_fraud`). */
  decayDays: number | null;
  subject: "mentor" | "student" | "any";
};

/** docs/10 §4.2's full trust-event catalog, verbatim points/decay/subject. */
export const TRUST_EVENT_CATALOG: Record<TrustEventType, TrustEventCatalogEntry> = {
  mentor_no_show: { points: 3, decayDays: 90, subject: "mentor" },
  mentor_late_cancel_24h: { points: 2, decayDays: 90, subject: "mentor" },
  mentor_late_cancel_2h: { points: 3, decayDays: 90, subject: "mentor" },
  mentor_cancel_24_72h: { points: 1, decayDays: 90, subject: "mentor" },
  mentor_late_arrival_reported: { points: 1, decayDays: 90, subject: "mentor" },
  student_no_show: { points: 2, decayDays: 90, subject: "student" },
  free_event_no_show: { points: 1, decayDays: 90, subject: "student" },
  hold_abuse: { points: 1, decayDays: 30, subject: "student" },
  off_platform_solicitation_first: { points: 2, decayDays: 180, subject: "any" },
  off_platform_solicitation_repeat: { points: 4, decayDays: 180, subject: "any" },
  report_upheld_minor: { points: 2, decayDays: 180, subject: "any" },
  report_upheld_major: { points: 6, decayDays: 365, subject: "any" },
  chargeback_lost_friendly_fraud: { points: 5, decayDays: 365, subject: "student" },
  review_manipulation: { points: 6, decayDays: 365, subject: "any" },
  verification_fraud: { points: 10, decayDays: null, subject: "mentor" },
};

export function pointsFor(type: TrustEventType): number {
  return TRUST_EVENT_CATALOG[type].points;
}

export function expiresAt(type: TrustEventType, occurredAt: Date): Date | null {
  const decayDays = TRUST_EVENT_CATALOG[type].decayDays;
  if (decayDays === null) return null;
  return new Date(occurredAt.getTime() + decayDays * 86_400_000);
}

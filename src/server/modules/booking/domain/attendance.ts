import type { AttendanceClaimOutcome } from "./types";

/**
 * Attendance outcome determination (docs/09 §11). `null` means no claim was made ("silent"); the
 * literal `"held"` claim means a party explicitly confirmed the session happened. Signals (join
 * click / check-in) are weak corroborating evidence, not proof — this is acceptable for MVP with
 * human review of anything that resolves to `disputed` (docs/09 §11 known limitation).
 */
export type AttendanceOutcome =
  | "completed"
  | "provisional_no_show_mentor"
  | "provisional_no_show_student"
  | "disputed"
  | "technical";

export type AttendanceEvidence = {
  studentClaim: AttendanceClaimOutcome | null;
  mentorClaim: AttendanceClaimOutcome | null;
  mentorSignaled: boolean;
  studentSignaled: boolean;
};

const CONFIRMING = new Set<AttendanceClaimOutcome | null>([null, "held"]);

export function determineAttendanceOutcome(evidence: AttendanceEvidence): AttendanceOutcome {
  const { studentClaim: s, mentorClaim: m, mentorSignaled, studentSignaled } = evidence;

  if (s === "technical_issue" || m === "technical_issue") return "technical";

  if (CONFIRMING.has(s) && CONFIRMING.has(m)) return "completed";

  if (s === "mentor_absent" && m === "student_absent") return "disputed";

  if (s === "mentor_absent" && m === null) {
    return mentorSignaled ? "disputed" : "provisional_no_show_mentor";
  }
  if (s === "mentor_absent" && m === "held") return "disputed";

  if (s === null && m === "student_absent") {
    return mentorSignaled && !studentSignaled ? "provisional_no_show_student" : "disputed";
  }
  if (s === "held" && m === "student_absent") return "disputed";

  // Any other combination (e.g. both explicitly blame with unexpected evidence shapes) needs a
  // human to look at it rather than a guessed automatic outcome.
  return "disputed";
}

/**
 * Group-session cascade (docs/18 S12): "Any participant's claim [of mentor absence] + no mentor
 * signals → provisional no-show for all seats." A single student proving the mentor never showed
 * shouldn't require every other silent student to separately file the same claim. The caller only
 * applies this to a booking whose own student is silent (no claim of their own) — a booking with
 * its own explicit claim (confirming it happened, or a technical-issue claim) keeps resolving
 * through the ordinary single-booking `determineAttendanceOutcome` instead.
 */
export function sessionMentorAbsenceCascadeApplies(
  studentClaimOutcomesInSession: readonly AttendanceClaimOutcome[],
  mentorSignaled: boolean,
): boolean {
  return !mentorSignaled && studentClaimOutcomesInSession.includes("mentor_absent");
}

/**
 * Free events have no money at stake and no claim/contest workflow (docs/10 §4.2: the
 * `free_event_no_show` trust event is "registered, no join signal" — purely automatic). A
 * registrant who never fired a join/check-in signal is a no-show; everyone else completed.
 */
export function determineEventAttendanceOutcome(input: {
  studentSignaled: boolean;
}): "completed" | "no_show_student" {
  return input.studentSignaled ? "completed" : "no_show_student";
}

export type NoShowGraceInput = {
  durationMin: number;
  shortSessionMaxMin: number;
  graceShortMin: number;
  graceOtherMin: number;
};

/** Earliest a party may file an "other absent" claim, in minutes after the session start. */
export function noShowGraceMinutes(input: NoShowGraceInput): number {
  return input.durationMin <= input.shortSessionMaxMin ? input.graceShortMin : input.graceOtherMin;
}

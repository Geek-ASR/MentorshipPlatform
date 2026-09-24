import type { BookingStatus } from "./types";

/**
 * Booking state transitions (docs/09 §7.1), defined once as a table. Every status change goes
 * through `transition()`, which validates the move and returns intents for the caller to act on —
 * this file never touches the database or the clock.
 */
export type BookingEvent =
  | "payment_succeeded"
  | "hold_expired"
  | "student_cancel"
  | "mentor_cancel"
  | "admin_cancel"
  | "system_cancel"
  | "late_payment_reacquired"
  | "late_payment_slot_lost"
  | "session_end_reached"
  | "attendance_finalized_no_dispute"
  | "attendance_finalized_provisional_no_show_mentor"
  | "attendance_finalized_provisional_no_show_student"
  | "attendance_disputed"
  | "no_show_contested"
  | "review_dispute_opened"
  | "dispute_resolved_for_mentor"
  | "dispute_resolved_for_student";

export type TransitionIntent =
  | { type: "release_calendar_block" }
  | { type: "refund_full"; reason: string }
  | { type: "reliability_event"; points: number }
  | { type: "notify"; template: string };

type TransitionRule = {
  from: BookingStatus;
  event: BookingEvent;
  to: BookingStatus;
  intents?: TransitionIntent[];
};

const TRANSITIONS: readonly TransitionRule[] = [
  { from: "held", event: "payment_succeeded", to: "confirmed" },
  {
    from: "held",
    event: "hold_expired",
    to: "expired",
    intents: [{ type: "release_calendar_block" }],
  },
  {
    from: "held",
    event: "student_cancel",
    to: "cancelled_by_student",
    intents: [{ type: "release_calendar_block" }],
  },
  { from: "expired", event: "late_payment_reacquired", to: "confirmed" },
  {
    from: "expired",
    event: "late_payment_slot_lost",
    to: "payment_orphaned",
    intents: [{ type: "refund_full", reason: "slot_lost" }],
  },
  {
    from: "cancelled_by_student",
    event: "late_payment_slot_lost",
    to: "payment_orphaned",
    intents: [{ type: "refund_full", reason: "slot_lost" }],
  },
  {
    // A group seat that was still `held` (unpaid) when the min-participants check cancelled its
    // session (docs/09 §8) — no per-booking intents: the session's calendar block and any actually
    // captured payments are handled once, at the session level, by the caller (`application/
    // group-sessions.ts`), not per booking.
    from: "held",
    event: "system_cancel",
    to: "cancelled_system",
  },
  {
    // Mirrors the `cancelled_by_student` row above: a payment that captures after the *system*
    // already cancelled the seat (session went below minimum, or the session no longer exists) must
    // never be silently reconciled by re-acquiring anything — there's no session left to reacquire
    // into. Always orphan for a full refund.
    from: "cancelled_system",
    event: "late_payment_slot_lost",
    to: "payment_orphaned",
    intents: [{ type: "refund_full", reason: "slot_lost" }],
  },
  {
    from: "confirmed",
    event: "student_cancel",
    to: "cancelled_by_student",
    intents: [{ type: "release_calendar_block" }],
  },
  {
    from: "confirmed",
    event: "mentor_cancel",
    to: "cancelled_by_mentor",
    intents: [{ type: "release_calendar_block" }, { type: "refund_full", reason: "mentor_cancel" }],
  },
  {
    from: "confirmed",
    event: "admin_cancel",
    to: "cancelled_by_admin",
    intents: [{ type: "release_calendar_block" }, { type: "refund_full", reason: "admin_cancel" }],
  },
  {
    from: "confirmed",
    event: "system_cancel",
    to: "cancelled_system",
    intents: [{ type: "release_calendar_block" }, { type: "refund_full", reason: "system_cancel" }],
  },
  { from: "confirmed", event: "session_end_reached", to: "awaiting_outcome" },
  { from: "awaiting_outcome", event: "attendance_finalized_no_dispute", to: "completed" },
  {
    from: "awaiting_outcome",
    event: "attendance_finalized_provisional_no_show_mentor",
    to: "no_show_mentor",
  },
  {
    from: "awaiting_outcome",
    event: "attendance_finalized_provisional_no_show_student",
    to: "no_show_student",
  },
  { from: "awaiting_outcome", event: "attendance_disputed", to: "disputed" },
  { from: "no_show_mentor", event: "no_show_contested", to: "disputed" },
  { from: "no_show_student", event: "no_show_contested", to: "disputed" },
  { from: "completed", event: "review_dispute_opened", to: "disputed" },
  { from: "disputed", event: "dispute_resolved_for_mentor", to: "completed" },
  {
    from: "disputed",
    event: "dispute_resolved_for_student",
    to: "resolved_refunded",
    intents: [{ type: "refund_full", reason: "dispute_resolved_for_student" }],
  },
];

export type Booking = { status: BookingStatus };

export type TransitionResult = { to: BookingStatus; intents: TransitionIntent[] };

/** Throws if no rule matches; callers map that to `INVALID_STATE_TRANSITION`. */
export function transition(from: BookingStatus, event: BookingEvent): TransitionResult {
  const rule = TRANSITIONS.find((r) => r.from === from && r.event === event);
  if (!rule) throw new Error(`No transition for event "${event}" from status "${from}"`);
  return { to: rule.to, intents: rule.intents ?? [] };
}

export function canTransition(from: BookingStatus, event: BookingEvent): boolean {
  return TRANSITIONS.some((r) => r.from === from && r.event === event);
}

const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "completed",
  "resolved_refunded",
  "payment_orphaned",
]);

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

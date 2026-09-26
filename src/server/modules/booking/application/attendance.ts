import { eq } from "drizzle-orm";
import type { Database, Executor } from "@/server/platform/db/client";
import type { UserActor } from "@/server/platform/authz/actor";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { findService } from "../infra/service-repo";
import { createFakeGateway, refundOrderItem } from "@/server/modules/payments";
import {
  determineAttendanceOutcome,
  determineEventAttendanceOutcome,
  noShowGraceMinutes,
  sessionMentorAbsenceCascadeApplies,
} from "../domain/attendance";
import { canTransition, transition } from "../domain/state-machine";
import type { AttendanceClaimOutcome } from "../domain/types";
import { findSession, sessionWindow, type SessionRow } from "../infra/session-repo";
import { bookings } from "../infra/tables";
import {
  listClaimsForBooking,
  listClaimsForSession,
  listSignalsForSession,
  recordSignal,
  upsertClaim,
  type AttendanceClaimRow,
} from "../infra/attendance-repo";
import {
  findBooking,
  listConfirmedPastEnd,
  transitionBookingStatus,
  type BookingRow,
} from "../infra/booking-repo";

async function loadParticipant(executor: Executor, actor: UserActor, sessionId: string) {
  const session = await findSession(executor, sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.hostUserId !== actor.userId) {
    // For 1:1 sessions the only other participant is the booking's student.
    const [booking] = await listBookingsForSessionInternal(executor, sessionId);
    if (!booking || booking.studentId !== actor.userId) throw new AppError("NOT_FOUND");
  }
  return session;
}

async function listBookingsForSessionInternal(executor: Executor, sessionId: string) {
  // A thin, module-private lookup: booking-repo doesn't need a public "by session" query for anyone
  // else, so it stays here rather than growing the repo's public surface for one caller.
  return executor.select().from(bookings).where(eq(bookings.sessionId, sessionId));
}

export async function joinSession(
  db: Database,
  actor: UserActor,
  sessionId: string,
  now: Date,
): Promise<{ meetingUrl: string | null }> {
  const session = await loadParticipant(db, actor, sessionId);
  const { start, end } = sessionWindow(session);
  const windowBeforeMin = await getSetting(db, "join.window_before_min", now);
  const windowStart = new Date(start.getTime() - windowBeforeMin * 60_000);
  if (now < windowStart || now > end) {
    throw new AppError("BAD_REQUEST", { detail: "The join link isn't active yet." });
  }
  await recordSignal(db, { sessionId, userId: actor.userId, kind: "join_click", occurredAt: now });
  // A session-specific link wins; otherwise the mentor's link for the service it was booked from
  // (read now, so a link added or corrected after booking still reaches the student).
  if (session.meetingUrl) return { meetingUrl: session.meetingUrl };
  const service = session.serviceId ? await findService(db, session.serviceId) : undefined;
  return { meetingUrl: service?.meetingUrl ?? null };
}

export async function checkIn(
  db: Database,
  actor: UserActor,
  sessionId: string,
  now: Date,
): Promise<void> {
  const session = await loadParticipant(db, actor, sessionId);
  const { start } = sessionWindow(session);
  const window = await getSetting(db, "attendance.checkin_window_min", now);
  const windowStart = new Date(start.getTime() - window.beforeMin * 60_000);
  const windowEnd = new Date(start.getTime() + window.afterMin * 60_000);
  if (now < windowStart || now > windowEnd) {
    throw new AppError("BAD_REQUEST", {
      detail: "Check-in is only available around the session start.",
    });
  }
  await recordSignal(db, { sessionId, userId: actor.userId, kind: "check_in", occurredAt: now });
}

/**
 * When a participant may tell us how a session went (docs/09 §11): whether it happened, or a
 * technical problem, from the start; that the other party didn't show, only after the no-show grace
 * — the same rule `submitAttendanceClaim` enforces, so the booking page can say when it opens.
 */
export async function attendanceClaimWindow(
  executor: Executor,
  session: SessionRow,
  now: Date,
): Promise<{ opensAt: Date; absenceOpensAt: Date }> {
  const { start, end } = sessionWindow(session);
  const durationMin = (end.getTime() - start.getTime()) / 60_000;
  const graceConfig = await getSetting(executor, "attendance.no_show_grace_min", now);
  const graceMin = noShowGraceMinutes({ durationMin, ...graceConfig });
  return { opensAt: start, absenceOpensAt: new Date(start.getTime() + graceMin * 60_000) };
}

export async function submitAttendanceClaim(
  db: Database,
  actor: UserActor,
  bookingId: string,
  outcome: AttendanceClaimOutcome,
  note: string | null,
  now: Date,
): Promise<void> {
  return db.transaction(async (tx) => {
    const booking = await findBooking(tx, bookingId);
    if (!booking) throw new AppError("NOT_FOUND");
    const session = await findSession(tx, booking.sessionId);
    if (!session) throw new AppError("NOT_FOUND");
    const isStudent = booking.studentId === actor.userId;
    const isMentor = session.hostUserId === actor.userId;
    if (!isStudent && !isMentor) throw new AppError("NOT_FOUND");
    if (!["confirmed", "awaiting_outcome"].includes(booking.status)) {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This session isn't awaiting an outcome.",
      });
    }

    const { start, end } = sessionWindow(session);
    if (now < start)
      throw new AppError("BAD_REQUEST", { detail: "The session hasn't started yet." });
    if (outcome === "mentor_absent" || outcome === "student_absent") {
      const durationMin = (end.getTime() - start.getTime()) / 60_000;
      const graceConfig = await getSetting(tx, "attendance.no_show_grace_min", now);
      const graceMin = noShowGraceMinutes({ durationMin, ...graceConfig });
      if (now.getTime() < start.getTime() + graceMin * 60_000) {
        throw new AppError("BAD_REQUEST", {
          detail: "It's too early to claim the other party is absent.",
        });
      }
    }

    await upsertClaim(tx, { bookingId, claimantUserId: actor.userId, outcome, note });

    // A fresh conflicting claim against an already-provisional no-show contests it immediately,
    // rather than waiting for the periodic finaliser to notice (docs/09 §7.1 no_show_contested).
    if (
      (booking.status === "no_show_mentor" || booking.status === "no_show_student") &&
      canTransition(booking.status, "no_show_contested")
    ) {
      const result = transition(booking.status, "no_show_contested");
      await transitionBookingStatus(tx, bookingId, booking.version, result.to, now);
    }

    await writeAudit(tx, {
      actorType: "user",
      actorUserId: actor.userId,
      action: "booking.attendance_claim_submitted",
      targetType: "booking",
      targetId: bookingId,
      metadata: { outcome },
    });
  });
}

export type FinalizerSummary = { movedToAwaitingOutcome: number; resolved: number };

/**
 * Recurring job (docs/09 §11): flips ended `confirmed` bookings to `awaiting_outcome`, then
 * resolves any whose evidence window has matured. Idempotent — re-running only touches bookings
 * still in a non-terminal state, so at-least-once outbox delivery is safe.
 */
export async function runAttendanceFinalizer(db: Database, now: Date): Promise<FinalizerSummary> {
  let movedToAwaitingOutcome = 0;
  let resolved = 0;

  const ended = await listConfirmedPastEnd(db, now);
  for (const booking of ended) {
    if (!canTransition(booking.status, "session_end_reached")) continue;
    const result = transition(booking.status, "session_end_reached");
    const updated = await transitionBookingStatus(db, booking.id, booking.version, result.to, now);
    if (updated) movedToAwaitingOutcome += 1;
  }

  const [finalizeAfterHours, silentCompleteAfterHours] = await Promise.all([
    getSetting(db, "attendance.finalize_after_end_hours", now),
    getSetting(db, "attendance.silent_complete_after_end_hours", now),
  ]);

  // Per-run cache: a group session's claims are session-wide evidence (docs/18 S12), so every seat
  // in the same session reuses one query instead of one per booking.
  const sessionClaimsCache = new Map<string, AttendanceClaimRow[]>();
  async function claimsForSession(sessionId: string): Promise<AttendanceClaimRow[]> {
    const cached = sessionClaimsCache.get(sessionId);
    if (cached) return cached;
    const claims = await listClaimsForSession(db, sessionId);
    sessionClaimsCache.set(sessionId, claims);
    return claims;
  }

  const awaiting = await listAwaitingOutcome(db);
  for (const booking of awaiting) {
    const session = await findSession(db, booking.sessionId);
    if (!session) continue;
    const { end } = sessionWindow(session);
    const elapsedHours = (now.getTime() - end.getTime()) / 3_600_000;
    const signals = await listSignalsForSession(db, session.id);
    const studentSignaled = signals.some((s) => s.userId === booking.studentId);

    let event: Parameters<typeof transition>[1];
    let outcomeLabel: string;
    let requiredHours: number;

    if (session.kind === "event") {
      // Free events have no money at stake and no claim/contest workflow (docs/10 §4.2) — a signal
      // check alone, finalised on the same cadence as a claim-backed outcome (there's no reason to
      // wait the longer silent-complete grace when no claim will ever arrive to wait for).
      const outcome = determineEventAttendanceOutcome({ studentSignaled });
      event =
        outcome === "completed"
          ? "attendance_finalized_no_dispute"
          : "attendance_finalized_provisional_no_show_student";
      outcomeLabel = outcome;
      requiredHours = finalizeAfterHours;
    } else {
      const mentorSignaled = signals.some((s) => s.userId === session.hostUserId);
      const sessionClaims =
        session.kind === "group"
          ? await claimsForSession(session.id)
          : await listClaimsForBooking(db, booking.id);
      const studentClaim =
        sessionClaims.find((c) => c.claimantUserId === booking.studentId)?.outcome ?? null;
      const mentorClaim =
        sessionClaims.find((c) => c.claimantUserId === session.hostUserId)?.outcome ?? null;
      const cascadeApplies =
        session.kind === "group" &&
        studentClaim === null &&
        sessionMentorAbsenceCascadeApplies(
          sessionClaims
            .filter((c) => c.claimantUserId !== session.hostUserId)
            .map((c) => c.outcome),
          mentorSignaled,
        );

      const outcome = cascadeApplies
        ? "provisional_no_show_mentor"
        : determineAttendanceOutcome({
            studentClaim,
            mentorClaim,
            mentorSignaled,
            studentSignaled,
          });

      const hasEvidence = studentClaim !== null || mentorClaim !== null || cascadeApplies;
      requiredHours = hasEvidence ? finalizeAfterHours : silentCompleteAfterHours;
      outcomeLabel = outcome;
      event =
        outcome === "completed"
          ? "attendance_finalized_no_dispute"
          : outcome === "provisional_no_show_mentor"
            ? "attendance_finalized_provisional_no_show_mentor"
            : outcome === "provisional_no_show_student"
              ? "attendance_finalized_provisional_no_show_student"
              : "attendance_disputed"; // 'disputed' and 'technical' both route to human review.
    }

    if (elapsedHours < requiredHours) continue;
    if (!canTransition(booking.status, event)) continue;
    const result = transition(booking.status, event);
    const updated = await transitionBookingStatus(db, booking.id, booking.version, result.to, now);
    if (updated) {
      resolved += 1;
      await writeAudit(db, {
        actorType: "system",
        action: "booking.attendance_finalized",
        targetType: "booking",
        targetId: booking.id,
        metadata: { outcome: outcomeLabel, technicalIssue: outcomeLabel === "technical" },
      });
      // Trust-event signals (docs/10 §4.2) — `booking` only ever writes an audit-log fact; `trust`'s
      // own ingestion poller converts these into real, decaying trust_events (ADR-035: `booking`
      // must never import `trust`, matching the one-directional-DAG discipline ADR-029 established
      // for payments). A group no-show cascade (docs/18 S12) produces one signal per affected seat —
      // "booking final no_show_mentor" reads as per-booking in the docs, so a group incident that
      // strands more students really does compound the mentor's points, not just count once.
      if (session.kind === "event" && outcomeLabel === "no_show_student") {
        await writeAudit(db, {
          actorType: "system",
          action: "booking.free_event_no_show_signal",
          targetType: "booking",
          targetId: booking.id,
          metadata: { studentId: booking.studentId, sessionId: session.id },
        });
      } else if (outcomeLabel === "provisional_no_show_mentor") {
        await writeAudit(db, {
          actorType: "system",
          action: "booking.mentor_no_show_signal",
          targetType: "booking",
          targetId: booking.id,
          metadata: { mentorUserId: session.hostUserId, sessionId: session.id },
        });
        // docs/10 §5 Level 0: "Any mentor no-show -> Student full refund" — automatic, not gated on
        // a dispute (a student can still dispute a *wrong* no-show call afterwards via trust's
        // dispute flow, which walks this back). A `held` (unpaid) or free (priceMinor 0) booking has
        // nothing to refund.
        if (booking.orderItemId && booking.priceMinor > 0) {
          // Must run inside its own transaction: `refundOrderItem` posts a multi-line ledger journal
          // and the balance check is a deferred constraint trigger, only validated at transaction
          // end — calling it with the bare `db` (auto-commit per statement) would check the journal
          // balanced after each individual line, which a 2+-line journal never is until complete.
          await db.transaction(async (tx) => {
            const gateway = createFakeGateway(tx);
            await refundOrderItem(
              tx,
              gateway,
              {
                orderItemId: booking.orderItemId!,
                refundMinor: booking.priceMinor,
                reasonCode: "mentor_no_show",
                initiatedBy: "system",
                idempotencyKey: `no-show-refund:${booking.id}`,
              },
              now,
            );
          });
        }
      } else if (outcomeLabel === "provisional_no_show_student") {
        await writeAudit(db, {
          actorType: "system",
          action: "booking.student_no_show_signal",
          targetType: "booking",
          targetId: booking.id,
          metadata: { studentId: booking.studentId, sessionId: session.id },
        });
      }
    }
  }

  return { movedToAwaitingOutcome, resolved };
}

async function listAwaitingOutcome(executor: Executor): Promise<BookingRow[]> {
  return executor.select().from(bookings).where(eq(bookings.status, "awaiting_outcome"));
}

import { eq } from "drizzle-orm";
import type { Database, Executor } from "@/server/platform/db/client";
import type { UserActor } from "@/server/platform/authz/actor";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { determineAttendanceOutcome, noShowGraceMinutes } from "../domain/attendance";
import { canTransition, transition } from "../domain/state-machine";
import type { AttendanceClaimOutcome } from "../domain/types";
import { findSession, sessionWindow } from "../infra/session-repo";
import { bookings } from "../infra/tables";
import {
  listClaimsForBooking,
  listSignalsForSession,
  recordSignal,
  upsertClaim,
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
  return { meetingUrl: session.meetingUrl };
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

  const awaiting = await listAwaitingOutcome(db);
  for (const booking of awaiting) {
    const session = await findSession(db, booking.sessionId);
    if (!session) continue;
    const { end } = sessionWindow(session);
    const elapsedHours = (now.getTime() - end.getTime()) / 3_600_000;

    const claims = await listClaimsForBooking(db, booking.id);
    const studentClaim =
      claims.find((c) => c.claimantUserId === booking.studentId)?.outcome ?? null;
    const mentorClaim =
      claims.find((c) => c.claimantUserId === session.hostUserId)?.outcome ?? null;
    const signals = await listSignalsForSession(db, session.id);
    const mentorSignaled = signals.some((s) => s.userId === session.hostUserId);
    const studentSignaled = signals.some((s) => s.userId === booking.studentId);

    const outcome = determineAttendanceOutcome({
      studentClaim,
      mentorClaim,
      mentorSignaled,
      studentSignaled,
    });

    const bothSilent = studentClaim === null && mentorClaim === null;
    const requiredHours = bothSilent ? silentCompleteAfterHours : finalizeAfterHours;
    if (elapsedHours < requiredHours) continue;

    const event =
      outcome === "completed"
        ? "attendance_finalized_no_dispute"
        : outcome === "provisional_no_show_mentor"
          ? "attendance_finalized_provisional_no_show_mentor"
          : outcome === "provisional_no_show_student"
            ? "attendance_finalized_provisional_no_show_student"
            : "attendance_disputed"; // 'disputed' and 'technical' both route to human review.

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
        metadata: { outcome, technicalIssue: outcome === "technical" },
      });
    }
  }

  return { movedToAwaitingOutcome, resolved };
}

async function listAwaitingOutcome(executor: Executor): Promise<BookingRow[]> {
  return executor.select().from(bookings).where(eq(bookings.status, "awaiting_outcome"));
}

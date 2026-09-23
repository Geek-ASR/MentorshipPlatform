import { sql } from "drizzle-orm";
import type { Database, Executor } from "@/server/platform/db/client";
import { hasSqlState } from "@/server/platform/db/client";
import type { UserActor } from "@/server/platform/authz/actor";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { addMinutes } from "../domain/time";
import { parseTstzRange } from "@/server/platform/db/sql-helpers";
import { findUserById } from "@/server/modules/auth";
import { notifyBookingRescheduled, scheduleBookingTimers } from "./notifications";
import { findSchedulingSettings } from "../infra/scheduling-repo";
import {
  findSession,
  insertCalendarBlock,
  releaseCalendarBlockForSession,
  sessionWindow,
} from "../infra/session-repo";
import { findBooking, type BookingRow } from "../infra/booking-repo";
import {
  countSelfServiceReschedules,
  decideReschedule as decideRescheduleRow,
  findPendingReschedule,
  insertRescheduleRequest,
  type RescheduleRequestRow,
} from "../infra/reschedule-repo";

function hoursUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 3_600_000;
}

async function loadBookingSession(executor: Executor, bookingId: string) {
  const booking = await findBooking(executor, bookingId);
  if (!booking) throw new AppError("NOT_FOUND");
  const session = await findSession(executor, booking.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  return { booking, session };
}

/** Swaps a session's calendar block in one transaction (docs/09 §6.4): release old, insert new;
 * any exclusion-constraint failure on the new block rolls back the whole transaction untouched. */
async function moveSession(
  tx: Executor,
  session: { id: string; hostUserId: string },
  newStart: Date,
  newEnd: Date,
  bufferAfterMin: number,
  now: Date,
): Promise<void> {
  await releaseCalendarBlockForSession(tx, session.id, now);
  try {
    await insertCalendarBlock(tx, {
      mentorId: session.hostUserId,
      sourceType: "session",
      sourceId: session.id,
      start: newStart,
      end: addMinutes(newEnd, bufferAfterMin),
    });
  } catch (error) {
    if (hasSqlState(error, "23P01")) {
      throw new AppError("SLOT_UNAVAILABLE", {
        detail: "That slot was just taken. Please pick another time.",
      });
    }
    throw error;
  }
  await tx.execute(sql`
    UPDATE app.sessions SET during = ${`[${newStart.toISOString()},${newEnd.toISOString()})`}::tstzrange, updated_at = now()
    WHERE id = ${session.id}
  `);
}

export type RequestRescheduleResult =
  | { applied: true; request: RescheduleRequestRow }
  | { applied: false; request: RescheduleRequestRow };

export async function requestReschedule(
  db: Database,
  actor: UserActor,
  bookingId: string,
  newStartsAt: Date,
  now: Date,
): Promise<RequestRescheduleResult> {
  return db.transaction(async (tx) => {
    const { booking, session } = await loadBookingSession(tx, bookingId);
    const isStudent = booking.studentId === actor.userId;
    const isMentor = session.hostUserId === actor.userId;
    if (!isStudent && !isMentor) throw new AppError("NOT_FOUND");
    if (booking.status !== "confirmed") {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "Only a confirmed booking can be rescheduled.",
      });
    }

    const { start: currentStart, end: currentEnd } = sessionWindow(session);
    const durationMin = (currentEnd.getTime() - currentStart.getTime()) / 60_000;
    const newEnd = addMinutes(newStartsAt, durationMin);
    const settings = await findSchedulingSettings(tx, session.hostUserId);
    if (!settings) throw new AppError("NOT_FOUND");

    const requestedBy: "student" | "mentor" = isStudent ? "student" : "mentor";
    const hoursNotice = hoursUntil(currentStart, now);
    const [minHours, maxSelfService, consentTimeoutHours] = await Promise.all([
      getSetting(tx, "reschedule.student_self_service_min_hours", now),
      getSetting(tx, "reschedule.max_self_service_per_booking", now),
      getSetting(tx, "reschedule.consent_timeout_hours", now),
    ]);
    const priorSelfService = await countSelfServiceReschedules(tx, bookingId);

    const selfServiceEligible =
      requestedBy === "student" && hoursNotice >= minHours && priorSelfService < maxSelfService;

    if (selfServiceEligible) {
      await moveSession(tx, session, newStartsAt, newEnd, settings.bufferAfterMin, now);
      const request = await insertRescheduleRequest(tx, {
        bookingId,
        requestedBy,
        start: newStartsAt,
        end: newEnd,
        status: "accepted",
        expiresAt: null,
      });
      await decideRescheduleRow(tx, request.id, "accepted", now);
      await writeAudit(tx, {
        actorType: "user",
        actorUserId: actor.userId,
        action: "booking.rescheduled",
        targetType: "booking",
        targetId: bookingId,
        metadata: { by: requestedBy, selfService: true, newStartsAt: newStartsAt.toISOString() },
      });
      await notifyReschedule(tx, booking.studentId, session.hostUserId, newStartsAt);
      await scheduleBookingTimers(tx, bookingId, newStartsAt, newEnd, now);
      return { applied: true, request: { ...request, status: "accepted" as const } };
    }

    const timeoutAt = addMinutes(now, consentTimeoutHours * 60);
    const expiresAt = timeoutAt < currentStart ? timeoutAt : currentStart;
    const request = await insertRescheduleRequest(tx, {
      bookingId,
      requestedBy,
      start: newStartsAt,
      end: newEnd,
      status: "pending",
      expiresAt,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: actor.userId,
      action: "booking.reschedule_requested",
      targetType: "booking",
      targetId: bookingId,
      metadata: { by: requestedBy, newStartsAt: newStartsAt.toISOString() },
    });
    return { applied: false, request };
  });
}

export async function decideReschedule(
  db: Database,
  actor: UserActor,
  bookingId: string,
  requestId: string,
  decision: "accept" | "decline",
  now: Date,
): Promise<{ booking: BookingRow; request: RescheduleRequestRow }> {
  return db.transaction(async (tx) => {
    const { booking, session } = await loadBookingSession(tx, bookingId);
    const request = await findPendingReschedule(tx, bookingId);
    if (!request || request.id !== requestId) throw new AppError("NOT_FOUND");
    if (request.expiresAt && request.expiresAt <= now) {
      await decideRescheduleRow(tx, request.id, "expired", now);
      throw new AppError("CONFLICT", { detail: "This reschedule request has expired." });
    }

    const isStudent = booking.studentId === actor.userId;
    const isMentor = session.hostUserId === actor.userId;
    const deciderRole = request.requestedBy === "student" ? "mentor" : "student";
    const actorRole = isStudent ? "student" : isMentor ? "mentor" : undefined;
    if (!actorRole || actorRole !== deciderRole) throw new AppError("NOT_FOUND");

    if (decision === "decline") {
      await decideRescheduleRow(tx, request.id, "declined", now);
      await writeAudit(tx, {
        actorType: "user",
        actorUserId: actor.userId,
        action: "booking.reschedule_declined",
        targetType: "booking",
        targetId: bookingId,
      });
      return { booking, request: { ...request, status: "declined" } };
    }

    const settings = await findSchedulingSettings(tx, session.hostUserId);
    if (!settings) throw new AppError("NOT_FOUND");
    const { start: newStart, end: newEnd } = parseTstzRange(request.proposedDuring);

    await moveSession(tx, session, newStart, newEnd, settings.bufferAfterMin, now);
    await decideRescheduleRow(tx, request.id, "accepted", now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: actor.userId,
      action: "booking.rescheduled",
      targetType: "booking",
      targetId: bookingId,
      metadata: { by: deciderRole, selfService: false, newStartsAt: newStart.toISOString() },
    });
    await notifyReschedule(tx, booking.studentId, session.hostUserId, newStart);
    await scheduleBookingTimers(tx, bookingId, newStart, newEnd, now);
    return { booking, request: { ...request, status: "accepted" } };
  });
}

async function notifyReschedule(
  tx: Executor,
  studentId: string,
  mentorUserId: string,
  newStart: Date,
): Promise<void> {
  const [student, mentor] = await Promise.all([
    findUserById(tx, studentId),
    findUserById(tx, mentorUserId),
  ]);
  if (!student || !mentor) return;
  await notifyBookingRescheduled(tx, {
    studentEmail: student.email,
    mentorEmail: mentor.email,
    newStart,
  });
}

/** Expires pending reschedule requests whose consent window lapsed (docs/09 §7.3); the original
 * booking simply stands, so this only needs a status flip, not a compensating transaction. */
export async function expirePendingReschedules(db: Database, now: Date): Promise<number> {
  const result = await db.execute(sql`
    UPDATE app.reschedule_requests
    SET status = 'expired', decided_at = ${now.toISOString()}::timestamptz
    WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ${now.toISOString()}::timestamptz
  `);
  return result.count ?? 0;
}

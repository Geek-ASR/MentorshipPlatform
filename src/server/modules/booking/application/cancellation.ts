import { and, eq, gte } from "drizzle-orm";
import type { Database, Executor } from "@/server/platform/db/client";
import type { UserActor } from "@/server/platform/authz/actor";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { auditLogs } from "@/server/platform/db/tables/platform";
import { getSetting } from "@/server/platform/settings/settings";
import {
  cancellationQuote,
  mentorCancellationTrustEventSignal,
  type CancellationActor,
  type CancellationPolicySnapshot,
  type CancellationQuote,
} from "../domain/cancellation";
import { canTransition, transition } from "../domain/state-machine";
import { findUserById } from "@/server/modules/auth";
import { createFakeGateway, refundOrderItem } from "@/server/modules/payments";
import { notifyBookingCancelled } from "./notifications";
import { offerOrPromoteNextInLine } from "./waitlist";
import { findBooking, transitionBookingStatus, type BookingRow } from "../infra/booking-repo";
import {
  findSession,
  releaseCalendarBlockForSession,
  sessionWindow,
  setSessionStatus,
} from "../infra/session-repo";
import type { SessionKind } from "../domain/types";

const COURTESY_WINDOW_DAYS = 90;

/** A student's rolling goodwill allowance (docs/17 §cancellation) — read live at cancel time rather
 * than from the booking's policy snapshot, since it's a per-student budget, not a term of one
 * booking. */
async function hasCourtesyAvailable(
  executor: Executor,
  studentId: string,
  now: Date,
): Promise<boolean> {
  const allowance = await getSetting(
    executor,
    "cancellation.student.courtesy_late_cancels_per_90d",
    now,
  );
  if (allowance <= 0) return false;
  const cutoff = new Date(now.getTime() - COURTESY_WINDOW_DAYS * 86_400_000);
  const rows = await executor
    .select({ metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorUserId, studentId),
        eq(auditLogs.action, "booking.cancelled"),
        gte(auditLogs.occurredAt, cutoff),
      ),
    );
  const used = rows.filter((row) => row.metadata.usedCourtesy === true).length;
  return used < allowance;
}

function hoursUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 3_600_000;
}

async function loadParticipant(
  executor: Executor,
  userId: string,
  bookingId: string,
): Promise<{
  booking: BookingRow;
  start: Date;
  mentorUserId: string;
  sessionKind: SessionKind;
  role: CancellationActor;
}> {
  const booking = await findBooking(executor, bookingId);
  if (!booking) throw new AppError("NOT_FOUND");
  const session = await findSession(executor, booking.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  const { start } = sessionWindow(session);
  if (booking.studentId === userId)
    return {
      booking,
      start,
      mentorUserId: session.hostUserId,
      sessionKind: session.kind,
      role: "student",
    };
  if (session.hostUserId === userId)
    return {
      booking,
      start,
      mentorUserId: session.hostUserId,
      sessionKind: session.kind,
      role: "mentor",
    };
  throw new AppError("NOT_FOUND");
}

/**
 * A confirmed booking can't be cancelled once the session has begun: what happened is settled by
 * the attendance claims and, if needed, a dispute (docs/09 §11, docs/10 §8). Without this, a
 * student could join, then cancel before the attendance job ran and collect the late-cancel
 * courtesy refund for a session that took place. An unpaid hold can always be abandoned.
 */
function refuseOnceStarted(booking: BookingRow, start: Date, now: Date): void {
  if (booking.status !== "held" && now >= start) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      detail:
        "This session has already started, so it can't be cancelled. If something went wrong, tell us how it went on the booking page.",
    });
  }
}

export async function getCancellationQuote(
  db: Database,
  userId: string,
  bookingId: string,
  now: Date,
): Promise<CancellationQuote> {
  const { booking, start, role } = await loadParticipant(db, userId, bookingId);
  refuseOnceStarted(booking, start, now);
  const policy = booking.policySnapshot.cancellation as CancellationPolicySnapshot;
  const courtesyAvailable =
    role === "student" ? await hasCourtesyAvailable(db, userId, now) : false;
  return cancellationQuote({
    actor: role,
    hoursNotice: hoursUntil(start, now),
    priceMinor: booking.priceMinor,
    policy,
    courtesyAvailable,
  });
}

export async function cancelBooking(
  db: Database,
  actor: UserActor,
  bookingId: string,
  input: { reasonCode: string; note?: string },
  now: Date,
  appBaseUrl: string,
): Promise<{ booking: BookingRow; quote: CancellationQuote }> {
  return db.transaction(async (tx) => {
    const { booking, start, mentorUserId, sessionKind, role } = await loadParticipant(
      tx,
      actor.userId,
      bookingId,
    );
    refuseOnceStarted(booking, start, now);
    const event = role === "student" ? "student_cancel" : "mentor_cancel";
    if (!canTransition(booking.status, event)) {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This booking can't be cancelled from its current state.",
      });
    }
    const result = transition(booking.status, event);
    const updated = await transitionBookingStatus(tx, bookingId, booking.version, result.to, now);
    if (!updated) throw new AppError("CONFLICT");

    if (sessionKind === "one_on_one") {
      // A 1:1 booking is its session's sole seat, so cancelling it cancels the session too.
      for (const intent of result.intents) {
        if (intent.type === "release_calendar_block") {
          await releaseCalendarBlockForSession(tx, booking.sessionId, now);
        }
      }
      await setSessionStatus(tx, booking.sessionId, "cancelled");
    } else {
      // Group/event: this is one seat of many sharing a single session-level calendar block —
      // cancelling it never touches the session itself or that shared block (docs/09 §8/§9); it
      // just frees a seat, which may have someone waiting for it.
      await offerOrPromoteNextInLine(tx, booking.sessionId, now, appBaseUrl);
    }

    const policy = booking.policySnapshot.cancellation as CancellationPolicySnapshot;
    const hoursNotice = hoursUntil(start, now);
    const courtesyAvailable =
      role === "student" ? await hasCourtesyAvailable(tx, actor.userId, now) : false;
    const quote = cancellationQuote({
      actor: role,
      hoursNotice,
      priceMinor: booking.priceMinor,
      policy,
      courtesyAvailable,
    });

    await writeAudit(tx, {
      actorType: "user",
      actorUserId: actor.userId,
      action: "booking.cancelled",
      targetType: "booking",
      targetId: bookingId,
      metadata: {
        by: role,
        reasonCode: input.reasonCode,
        note: input.note,
        hoursNotice,
        refundPct: quote.refundPct,
        usedCourtesy: quote.usedCourtesy,
      },
    });

    if (role === "mentor") {
      // trust's ingestion poller converts this into the matching typed trust_events row (docs/10
      // §4.2's three-tier cancel ladder) — booking only ever writes the fact, never imports `trust`
      // (ADR-035, mirroring ADR-029's one-directional-DAG discipline for payments).
      const signal = mentorCancellationTrustEventSignal(hoursNotice);
      if (signal) {
        await writeAudit(tx, {
          actorType: "user",
          actorUserId: actor.userId,
          action: `booking.${signal}_signal`,
          targetType: "booking",
          targetId: bookingId,
          metadata: { mentorUserId, hoursNotice },
        });
      }
    }

    const [student, mentor] = await Promise.all([
      findUserById(tx, booking.studentId),
      findUserById(tx, mentorUserId),
    ]);
    if (student && mentor) {
      await notifyBookingCancelled(tx, {
        studentEmail: student.email,
        mentorEmail: mentor.email,
        start,
        cancelledBy: role,
      });
    }

    // A `held` booking has no captured payment yet (nothing to refund) — cancelling it just drops
    // the hold. Only a previously `confirmed` (paid and captured) booking needs money moved back.
    if (booking.status === "confirmed" && booking.orderItemId && quote.refundMinor > 0) {
      const gateway = createFakeGateway(tx);
      await refundOrderItem(
        tx,
        gateway,
        {
          orderItemId: booking.orderItemId,
          refundMinor: quote.refundMinor,
          reasonCode: input.reasonCode,
          initiatedBy: role === "mentor" ? "mentor" : "student",
          idempotencyKey: `cancel-refund:${bookingId}`,
        },
        now,
      );
    }

    return { booking: updated, quote };
  });
}

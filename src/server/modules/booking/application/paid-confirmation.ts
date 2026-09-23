import type { Database, Executor } from "@/server/platform/db/client";
import { hasSqlState } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { findUserById } from "@/server/modules/auth";
import { canTransition, transition } from "../domain/state-machine";
import { addMinutes } from "../domain/time";
import { findSession, insertCalendarBlock, sessionWindow } from "../infra/session-repo";
import { findBooking, transitionBookingStatus, type BookingRow } from "../infra/booking-repo";
import { notifyBookingConfirmed, scheduleBookingTimers } from "./notifications";

export type ConfirmPaidBookingOutcome =
  | { outcome: "confirmed"; booking: BookingRow }
  | { outcome: "already_settled"; booking: BookingRow }
  | { outcome: "orphaned"; booking: BookingRow; refundMinor: number };

/**
 * Called by the payments module once a payment_intent's capture is verified (docs/08 §5.1,
 * docs/09 §6.3) — confirms the booking, or if its hold already lapsed and the slot was taken by
 * someone else, orphans it so the caller can trigger a full refund. Idempotent: a redelivered
 * webhook calling this twice on an already-`confirmed` booking is a safe no-op.
 */
export async function confirmPaidBooking(
  db: Database,
  bookingId: string,
  now: Date,
  appBaseUrl: string,
): Promise<ConfirmPaidBookingOutcome> {
  return db.transaction(async (tx) => {
    const booking = await findBooking(tx, bookingId);
    if (!booking)
      throw new AppError("NOT_FOUND", { detail: "Booking not found for payment confirmation." });
    if (
      booking.status !== "held" &&
      booking.status !== "expired" &&
      booking.status !== "cancelled_by_student"
    ) {
      // Already confirmed by an earlier delivery, or moved on to some other terminal state.
      return { outcome: "already_settled", booking };
    }

    const session = await findSession(tx, booking.sessionId);
    if (!session) throw new AppError("NOT_FOUND");
    const { start, end } = sessionWindow(session);
    const bufferAfterMin = Number(
      (booking.policySnapshot as { bufferAfterMin?: number }).bufferAfterMin ?? 0,
    );

    if (booking.status === "held") {
      if (!canTransition(booking.status, "payment_succeeded")) {
        return { outcome: "already_settled", booking };
      }
      const result = transition(booking.status, "payment_succeeded");
      const updated = await transitionBookingStatus(
        tx,
        booking.id,
        booking.version,
        result.to,
        now,
      );
      if (!updated) return { outcome: "already_settled", booking };
      await finalizeConfirmation(tx, updated, session.hostUserId, start, end, now, appBaseUrl);
      return { outcome: "confirmed", booking: updated };
    }

    // Hold already lapsed (expired or the student abandoned/cancelled) — try to re-acquire the slot
    // for this late-but-verified capture before giving up (docs/09 §6.3 point 2).
    try {
      await insertCalendarBlock(tx, {
        mentorId: session.hostUserId,
        sourceType: "session",
        sourceId: session.id,
        start,
        end: addMinutes(end, bufferAfterMin),
      });
    } catch (error) {
      if (!hasSqlState(error, "23P01")) throw error;
      if (!canTransition(booking.status, "late_payment_slot_lost")) {
        return { outcome: "already_settled", booking };
      }
      const result = transition(booking.status, "late_payment_slot_lost");
      const updated = await transitionBookingStatus(
        tx,
        booking.id,
        booking.version,
        result.to,
        now,
      );
      return { outcome: "orphaned", booking: updated ?? booking, refundMinor: booking.priceMinor };
    }

    if (!canTransition(booking.status, "late_payment_reacquired")) {
      return { outcome: "already_settled", booking };
    }
    const result = transition(booking.status, "late_payment_reacquired");
    const updated = await transitionBookingStatus(tx, booking.id, booking.version, result.to, now);
    if (!updated) return { outcome: "already_settled", booking };
    await finalizeConfirmation(tx, updated, session.hostUserId, start, end, now, appBaseUrl);
    return { outcome: "confirmed", booking: updated };
  });
}

async function finalizeConfirmation(
  tx: Executor,
  booking: BookingRow,
  mentorUserId: string,
  start: Date,
  end: Date,
  now: Date,
  appBaseUrl: string,
): Promise<void> {
  const [student, mentor] = await Promise.all([
    findUserById(tx, booking.studentId),
    findUserById(tx, mentorUserId),
  ]);
  await writeAudit(tx, {
    actorType: "system",
    action: "booking.confirmed",
    targetType: "booking",
    targetId: booking.id,
    metadata: { source: "payment_capture" },
  });
  if (student && mentor) {
    const joinUrl = `${appBaseUrl}/sessions/${booking.sessionId}/join`;
    await notifyBookingConfirmed(tx, {
      studentEmail: student.email,
      mentorEmail: mentor.email,
      start,
      end,
      joinUrl,
    });
  }
  await scheduleBookingTimers(tx, booking.id, start, end, now);
}

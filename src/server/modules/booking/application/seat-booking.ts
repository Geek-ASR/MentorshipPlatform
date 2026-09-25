import type { Executor, Database } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { sha256Hex } from "@/server/platform/crypto";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import type { UserActor } from "@/server/platform/authz/actor";
import { activeRestriction } from "@/server/platform/authz/actor";
import { findUserById, hasActiveRestriction, isBlocked } from "@/server/modules/auth";
import { findMentorProfile } from "@/server/modules/profiles";
import {
  createCheckout,
  createFakeGateway,
  hasActivePayoutAccount,
  type CheckoutResult,
} from "@/server/modules/payments";
import { parseTstzRange } from "@/server/platform/db/sql-helpers";
import { findEventDetails, findEventInviteByToken, markInviteUsed } from "../infra/event-repo";
import {
  expireStaleHoldsForSession,
  insertBooking,
  listLiveBookingsForSession,
  type BookingRow,
} from "../infra/booking-repo";
import { findSessionForUpdate, type SessionRow } from "../infra/session-repo";
import { notifyBookingConfirmed, scheduleBookingTimers } from "./notifications";

export type BookSeatInput = {
  sessionId: string;
  intakeAnswers: { questionId: string; value: string }[];
  /** Required to book a `private` event; ignored otherwise (docs/09 §9). */
  inviteToken?: string;
};

export type BookSeatResult = {
  booking: BookingRow;
  isFree: boolean;
  checkout: CheckoutResult["checkout"] | null;
};

async function cancellationPolicySnapshot(
  executor: Executor,
  now: Date,
): Promise<Record<string, unknown>> {
  const [fullRefundHours, partialRefundHours, partialRefundPct, lateRefundPct, mentorRefundPct] =
    await Promise.all([
      getSetting(executor, "cancellation.student.full_refund_hours", now),
      getSetting(executor, "cancellation.student.partial_refund_hours", now),
      getSetting(executor, "cancellation.student.partial_refund_pct", now),
      getSetting(executor, "cancellation.student.late_refund_pct", now),
      getSetting(executor, "cancellation.mentor.refund_pct", now),
    ]);
  return { fullRefundHours, partialRefundHours, partialRefundPct, lateRefundPct, mentorRefundPct };
}

/**
 * The shared tail of "give this student a seat" (docs/09 §6.2) — checkout-or-immediate-confirm plus
 * notifications, factored out so both a direct `bookSeat` call and a waitlist offer claim
 * (`application/waitlist.ts`) produce an identical booking row instead of two slightly different
 * code paths for what's conceptually the same seat grant.
 */
export async function insertSeatForStudent(
  tx: Executor,
  session: SessionRow,
  studentId: string,
  intakeAnswers: { questionId: string; value: string }[],
  now: Date,
  appBaseUrl: string,
): Promise<BookSeatResult> {
  const isFree = session.seatPriceMinor === 0;
  const holdTtlMin = await getSetting(tx, "booking.hold_ttl_min", now);
  const bookingId = newId();
  let checkoutResult: CheckoutResult | null = null;
  if (!isFree) {
    const gateway = createFakeGateway(tx);
    checkoutResult = await createCheckout(tx, gateway, {
      studentId,
      bookingId,
      mentorUserId: session.hostUserId,
      serviceKind: session.kind,
      categoryId: null,
      baseMinor: session.seatPriceMinor,
      currency: session.currency,
      holdTtlMin,
      now,
    });
  }

  const bookingRow = await insertBooking(tx, {
    id: bookingId,
    sessionId: session.id,
    studentId,
    status: isFree ? "confirmed" : "held",
    holdExpiresAt: isFree
      ? null
      : (checkoutResult!.paymentIntent.holdExpiresAt ??
        new Date(now.getTime() + holdTtlMin * 60_000)),
    orderItemId: checkoutResult?.orderItem.id ?? null,
    priceMinor: session.seatPriceMinor,
    currency: session.currency,
    intakeAnswers,
    policySnapshot: { kind: session.kind, cancellation: await cancellationPolicySnapshot(tx, now) },
  });

  await writeAudit(tx, {
    actorType: "user",
    actorUserId: studentId,
    action: isFree ? "session.seat_registered" : "session.seat_held",
    targetType: "booking",
    targetId: bookingRow.id,
    metadata: { sessionId: session.id, kind: session.kind, priceMinor: session.seatPriceMinor },
  });

  if (isFree) {
    const [student, mentorUser] = await Promise.all([
      findUserById(tx, studentId),
      findUserById(tx, session.hostUserId),
    ]);
    const { start, end } = parseTstzRange(session.during);
    const joinUrl = `${appBaseUrl}/sessions/${session.id}/join`;
    if (student && mentorUser) {
      await notifyBookingConfirmed(tx, {
        studentEmail: student.email,
        mentorEmail: mentorUser.email,
        start,
        end,
        joinUrl,
      });
    }
    await scheduleBookingTimers(tx, bookingRow.id, start, end, now);
  }

  return { booking: bookingRow, isFree, checkout: checkoutResult?.checkout ?? null };
}

/**
 * The group-seat / free-event registration transaction (docs/09 §6.2): row-lock the session,
 * lazily expire this session's own stale holds, count live seats against capacity, then grant the
 * seat. A full session hands the caller `SLOT_UNAVAILABLE` with a `waitlistAvailable` hint rather
 * than a bare 409 — the client is expected to call `joinWaitlist` next.
 */
export async function bookSeat(
  db: Database,
  actor: UserActor,
  input: BookSeatInput,
  now: Date,
  appBaseUrl: string,
): Promise<BookSeatResult> {
  return db.transaction(async (tx) => {
    const session = await findSessionForUpdate(tx, input.sessionId);
    if (!session || (session.kind !== "group" && session.kind !== "event")) {
      throw new AppError("NOT_FOUND");
    }
    if (session.status !== "scheduled") {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "MENTOR_UNAVAILABLE" } });
    }
    if (session.hostUserId === actor.userId) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "SELF_BOOKING" } });
    }
    if (!actor.emailVerified) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "EMAIL_NOT_VERIFIED" } });
    }
    const user = await findUserById(tx, actor.userId);
    if (!user || !user.adultAttestedAt) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "AGE_POLICY" } });
    }
    if (activeRestriction(actor, "booking.create", now) !== undefined) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "ACCOUNT_RESTRICTED" } });
    }
    if (await hasActiveRestriction(tx, session.hostUserId, "booking.accept", now)) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "MENTOR_UNAVAILABLE" } });
    }
    if (await isBlocked(tx, actor.userId, session.hostUserId)) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "NOT_AVAILABLE" } });
    }
    if (session.registrationClosesAt && now >= session.registrationClosesAt) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", {
        extensions: { reason: "OUTSIDE_AVAILABILITY" },
      });
    }

    let usedInviteId: string | null = null;
    if (session.kind === "event") {
      const details = await findEventDetails(tx, session.id);
      if (!details) throw new AppError("NOT_FOUND");
      if (details.visibility === "private") {
        const invite = input.inviteToken
          ? await findEventInviteByToken(tx, session.id, sha256Hex(input.inviteToken))
          : undefined;
        const validInvite =
          invite && invite.usedAt === null && (invite.expiresAt === null || invite.expiresAt > now);
        // Never distinguish "wrong token" from "no token" from "event doesn't exist" — a private
        // event is invisible without a valid invite (docs/09 §9), matching this codebase's
        // established BOLA-safe 404 pattern (Phase 6/7).
        if (!validInvite) throw new AppError("NOT_FOUND");
        usedInviteId = invite.id;
      }
    }

    const isFree = session.seatPriceMinor === 0;
    if (!isFree) {
      const mentor = await findMentorProfile(tx, session.hostUserId);
      const payoutAccountActive = await hasActivePayoutAccount(tx, session.hostUserId);
      if (!mentor || mentor.payoutMode !== "paid" || !payoutAccountActive) {
        throw new AppError("BOOKING_NOT_ELIGIBLE", {
          extensions: { reason: "MENTOR_NOT_PAYABLE" },
        });
      }
    }

    await expireStaleHoldsForSession(tx, session.id, now);
    const liveBookings = await listLiveBookingsForSession(tx, session.id);
    if (liveBookings.some((b) => b.studentId === actor.userId)) {
      throw new AppError("CONFLICT", { detail: "You already have a seat for this session." });
    }
    if (liveBookings.length >= session.capacity) {
      throw new AppError("SLOT_UNAVAILABLE", {
        detail: "This session is full.",
        extensions: { waitlistAvailable: true },
      });
    }

    const result = await insertSeatForStudent(
      tx,
      session,
      actor.userId,
      input.intakeAnswers,
      now,
      appBaseUrl,
    );
    if (usedInviteId) await markInviteUsed(tx, usedInviteId, actor.userId, now);

    return result;
  });
}

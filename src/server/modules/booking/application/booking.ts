import { sql } from "drizzle-orm";
import type { Database } from "@/server/platform/db/client";
import { hasSqlState } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import type { UserActor } from "@/server/platform/authz/actor";
import { activeRestriction } from "@/server/platform/authz/actor";
import { findUserById, hasActiveRestriction, isBlocked } from "@/server/modules/auth";
import { findMentorProfile, latestAttestation } from "@/server/modules/profiles";
import {
  createCheckout,
  createFakeGateway,
  hasActivePayoutAccount,
  type CheckoutResult,
} from "@/server/modules/payments";
import { generateAvailableSlots } from "../domain/availability";
import { addMinutes, localDateKey } from "../domain/time";
import { evaluateBookingEligibility } from "../domain/eligibility";
import type { BookingEligibilityReason } from "../domain/types";
import { findService, priceForDuration } from "../infra/service-repo";
import {
  findSchedulingSettings,
  listAvailabilityExceptions,
  listAvailabilityRules,
} from "../infra/scheduling-repo";
import {
  countSessionsByLocalDate,
  findSession,
  insertCalendarBlock,
  insertOneOnOneSession,
  listActiveBlocksOverlapping,
  releaseCalendarBlockForSession,
  sessionWindow,
} from "../infra/session-repo";
import { notifyBookingConfirmed, scheduleBookingTimers } from "./notifications";
import {
  countActiveHoldsForStudent,
  countExpiredHoldsToday,
  countUpcomingFreeBookings,
  expireStaleHoldsOverlapping,
  findBooking,
  hasOverlappingBooking,
  insertBooking,
  transitionBookingStatus,
  type BookingRow,
} from "../infra/booking-repo";

const ELIGIBILITY_MESSAGES: Record<BookingEligibilityReason, string> = {
  EMAIL_NOT_VERIFIED: "Please verify your email address before booking.",
  AGE_POLICY: "Booking requires the age attestation from sign-up.",
  ACCOUNT_RESTRICTED: "This account can't book or accept sessions right now.",
  SELF_BOOKING: "You can't book a session with yourself.",
  NOT_AVAILABLE: "This mentor isn't available to you.",
  MENTOR_UNAVAILABLE: "This mentor isn't currently accepting bookings.",
  MENTOR_NOT_PAYABLE: "This service isn't bookable yet.",
  INVALID_DURATION: "That duration isn't offered for this service.",
  TOO_SOON: "This slot is inside the minimum notice window.",
  TOO_FAR: "This slot is too far in advance.",
  OUTSIDE_AVAILABILITY: "This slot is no longer available.",
  DAILY_LIMIT: "This mentor has reached their session limit for that day.",
  TOO_MANY_HOLDS: "You have too many pending bookings — finish or cancel one first.",
  STUDENT_OVERLAP: "You already have a booking that overlaps this time.",
  FREE_BOOKING_LIMIT: "You've reached the limit of free sessions you can have upcoming at once.",
};

function dayWindow(instant: Date): { start: Date; end: Date } {
  const start = new Date(instant);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: addMinutes(start, 1440) };
}

export type CreateBookingInput = {
  mentorUserId: string;
  serviceId: string;
  durationMin: number;
  startsAt: Date;
  intakeAnswers: { questionId: string; value: string }[];
};

export type CreateBookingResult = {
  booking: BookingRow;
  isFree: boolean;
  checkout: CheckoutResult["checkout"] | null;
};

/**
 * The booking transaction (docs/09 §6.1): serialize per mentor-local day, lazily expire stale
 * holds, re-validate eligibility with fresh reads, then insert session + calendar block (guarded by
 * the database's exclusion constraint) + booking (+ order/order_item/payment_intent for a priced,
 * payable service) — all inside one transaction, so a provider order failure rolls everything back.
 * Only `fake` is wired up (docs/19 Phase 8 deviations: no live Razorpay test-mode keys available).
 */
export async function createBooking(
  db: Database,
  actor: UserActor,
  input: CreateBookingInput,
  now: Date,
  appBaseUrl: string,
): Promise<CreateBookingResult> {
  const settings = await findSchedulingSettings(db, input.mentorUserId);
  if (!settings)
    throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "MENTOR_UNAVAILABLE" } });

  const end = addMinutes(input.startsAt, input.durationMin);
  const mentorLocalDate = localDateKey(input.startsAt, settings.timezone);
  const lockKey = `${input.mentorUserId}:${mentorLocalDate}`;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const { start: dayStart, end: dayEnd } = dayWindow(input.startsAt);
    await expireStaleHoldsOverlapping(tx, input.mentorUserId, dayStart, dayEnd, now);

    const [
      mentor,
      service,
      price,
      user,
      rules,
      exceptions,
      activeBlocks,
      sessionCounts,
      payoutAccountActive,
      attestation,
      mentorAcceptRestricted,
      blockedBetweenUsers,
    ] = await Promise.all([
      findMentorProfile(tx, input.mentorUserId),
      findService(tx, input.serviceId),
      priceForDuration(tx, input.serviceId, input.durationMin),
      findUserById(tx, actor.userId),
      listAvailabilityRules(tx, input.mentorUserId),
      listAvailabilityExceptions(tx, input.mentorUserId),
      listActiveBlocksOverlapping(tx, input.mentorUserId, dayStart, dayEnd),
      countSessionsByLocalDate(tx, input.mentorUserId, settings.timezone, dayStart, dayEnd),
      hasActivePayoutAccount(tx, input.mentorUserId),
      latestAttestation(tx, input.mentorUserId),
      hasActiveRestriction(tx, input.mentorUserId, "booking.accept", now),
      isBlocked(tx, actor.userId, input.mentorUserId),
    ]);

    if (!mentor || !service || service.mentorUserId !== input.mentorUserId || !user) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", { extensions: { reason: "MENTOR_UNAVAILABLE" } });
    }

    // Isolates "is this exact slot free of rules/exceptions/buffered blocks" from the notice/advance/
    // daily-cap checks below, which are evaluated separately for a precise error reason each.
    const ruleCheck = generateAvailableSlots({
      timeZone: settings.timezone,
      durationMin: input.durationMin,
      slotStepMin: settings.slotStepMin,
      bufferAfterMin: settings.bufferAfterMin,
      minNoticeMin: 0,
      maxAdvanceDays: 36_500,
      maxSessionsPerDay: Number.MAX_SAFE_INTEGER,
      from: input.startsAt,
      to: end,
      now,
      rules: rules.map((r) => ({
        weekday: r.weekday,
        startLocal: parseLocalTime(r.startLocal),
        endLocal: parseLocalTime(r.endLocal),
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      })),
      exceptions: exceptions.map((e) => ({ kind: e.kind, start: e.start, end: e.end })),
      activeBlocks,
      sessionCountByLocalDate: new Map(),
    });
    const slotInsideAvailability = ruleCheck.length === 1;

    const [activeHolds, expiredToday, overlapping, upcomingFree] = await Promise.all([
      countActiveHoldsForStudent(tx, actor.userId, now),
      countExpiredHoldsToday(tx, actor.userId, dayStart, dayEnd),
      hasOverlappingBooking(tx, actor.userId, input.startsAt, end),
      countUpcomingFreeBookings(tx, actor.userId, now),
    ]);

    const [
      maxActiveHolds,
      maxExpiredHoldsPerDay,
      maxUpcomingFreeBookings,
      holdTtlMin,
      cancellationSettings,
    ] = await Promise.all([
      getSetting(tx, "booking.max_active_holds_per_student", now),
      getSetting(tx, "booking.max_expired_holds_per_day", now),
      getSetting(tx, "booking.max_upcoming_free_1on1_per_student", now),
      getSetting(tx, "booking.hold_ttl_min", now),
      Promise.all([
        getSetting(tx, "cancellation.student.full_refund_hours", now),
        getSetting(tx, "cancellation.student.partial_refund_hours", now),
        getSetting(tx, "cancellation.student.partial_refund_pct", now),
        getSetting(tx, "cancellation.student.late_refund_pct", now),
        getSetting(tx, "cancellation.mentor.refund_pct", now),
      ]),
    ]);
    const [fullRefundHours, partialRefundHours, partialRefundPct, lateRefundPct, mentorRefundPct] =
      cancellationSettings;

    const eligibility = evaluateBookingEligibility({
      now,
      studentEmailVerified: actor.emailVerified,
      studentAdultAttestation: user.adultAttestedAt !== null,
      studentRestrictedFromBookingCreate:
        activeRestriction(actor, "booking.create", now) !== undefined,
      mentorRestrictedFromBookingAccept: mentorAcceptRestricted,
      isSelfBooking: actor.userId === input.mentorUserId,
      isBlockedBetweenUsers: blockedBetweenUsers,
      mentorApproved: mentor.applicationStatus === "approved",
      mentorListed: mentor.isListed,
      serviceActive: service.isActive,
      priceMinor: price?.priceMinor ?? 0,
      mentorPayoutMode: mentor.payoutMode,
      mentorHasActivePayoutAccount: payoutAccountActive,
      mentorEligibilityAttestationValid: attestation !== undefined && attestation.expiresAt > now,
      durationAllowed:
        service.allowedDurationsMin.includes(input.durationMin) && price !== undefined,
      startsAt: input.startsAt,
      minNoticeMin: settings.minNoticeMin,
      maxAdvanceDays: settings.maxAdvanceDays,
      slotInsideAvailability,
      mentorLocalSessionCountToday: sessionCounts.get(mentorLocalDate) ?? 0,
      maxSessionsPerDay: settings.maxSessionsPerDay,
      studentActiveHoldsCount: activeHolds,
      maxActiveHolds,
      studentExpiredHoldsToday: expiredToday,
      maxExpiredHoldsPerDay,
      studentHasOverlappingHeldOrConfirmedBooking: overlapping,
      studentUpcomingFreeBookingsCount: upcomingFree,
      maxUpcomingFreeBookings,
    });
    if (!eligibility.eligible) {
      throw new AppError("BOOKING_NOT_ELIGIBLE", {
        detail: ELIGIBILITY_MESSAGES[eligibility.reason],
        extensions: { reason: eligibility.reason },
      });
    }

    const isFree = (price?.priceMinor ?? 0) === 0;
    const sessionRow = await insertOneOnOneSession(tx, {
      hostUserId: input.mentorUserId,
      serviceId: input.serviceId,
      start: input.startsAt,
      end,
      seatPriceMinor: price!.priceMinor,
      currency: price!.currency,
      meetingProvider: null,
      meetingUrl: null,
    });

    try {
      await insertCalendarBlock(tx, {
        mentorId: input.mentorUserId,
        sourceType: "session",
        sourceId: sessionRow.id,
        start: input.startsAt,
        end: addMinutes(end, settings.bufferAfterMin),
      });
    } catch (error) {
      if (hasSqlState(error, "23P01")) {
        throw new AppError("SLOT_UNAVAILABLE", {
          detail: "Someone else just booked this slot. Please pick another time.",
        });
      }
      throw error;
    }

    const bookingId = newId();
    let checkoutResult: CheckoutResult | null = null;
    if (!isFree) {
      // Fake is the only gateway wired up this phase (docs/19 Phase 8 deviations).
      const gateway = createFakeGateway(tx);
      checkoutResult = await createCheckout(tx, gateway, {
        studentId: actor.userId,
        bookingId,
        mentorUserId: input.mentorUserId,
        serviceKind: service.kind,
        categoryId: null,
        baseMinor: price!.priceMinor,
        currency: price!.currency,
        holdTtlMin,
        now,
      });
    }

    const bookingRow = await insertBooking(tx, {
      id: bookingId,
      sessionId: sessionRow.id,
      studentId: actor.userId,
      status: isFree ? "confirmed" : "held",
      confirmedAt: isFree ? now : null,
      holdExpiresAt: isFree
        ? null
        : (checkoutResult!.paymentIntent.holdExpiresAt ?? addMinutes(now, holdTtlMin)),
      orderItemId: checkoutResult?.orderItem.id ?? null,
      priceMinor: price!.priceMinor,
      currency: price!.currency,
      intakeAnswers: input.intakeAnswers,
      policySnapshot: {
        cancellation: {
          fullRefundHours,
          partialRefundHours,
          partialRefundPct,
          lateRefundPct,
          mentorRefundPct,
        },
        bufferAfterMin: settings.bufferAfterMin,
      },
    });

    await writeAudit(tx, {
      actorType: "user",
      actorUserId: actor.userId,
      action: isFree ? "booking.confirmed" : "booking.held",
      targetType: "booking",
      targetId: bookingRow.id,
      metadata: {
        mentorUserId: input.mentorUserId,
        sessionId: sessionRow.id,
        priceMinor: price!.priceMinor,
      },
    });

    if (isFree) {
      const mentorUser = await findUserById(tx, input.mentorUserId);
      const joinUrl = `${appBaseUrl}/sessions/${sessionRow.id}/join`;
      await notifyBookingConfirmed(tx, {
        studentEmail: user.email,
        mentorEmail: mentorUser!.email,
        start: input.startsAt,
        end,
        joinUrl,
      });
      await scheduleBookingTimers(tx, bookingRow.id, input.startsAt, end, now);
    }
    // A `held` (paid) booking's confirmation email/timers wait for payment capture
    // (`application/webhooks.ts` calls `confirmPaidBooking`), not booking creation.

    return { booking: bookingRow, isFree, checkout: checkoutResult?.checkout ?? null };
  });
}

export async function getBookingForUser(
  db: Database,
  userId: string,
  bookingId: string,
): Promise<BookingRow & { start: Date; end: Date; mentorUserId: string }> {
  const booking = await findBooking(db, bookingId);
  if (!booking) throw new AppError("NOT_FOUND");
  const session = await sessionForBooking(db, booking);
  const isParticipant = booking.studentId === userId || session.hostUserId === userId;
  if (!isParticipant) throw new AppError("NOT_FOUND");
  const { start, end } = sessionWindow(session);
  return { ...booking, start, end, mentorUserId: session.hostUserId };
}

async function sessionForBooking(db: Database, booking: BookingRow) {
  const session = await findSession(db, booking.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  return session;
}

export async function releaseHoldOnCancel(
  db: Database,
  sessionId: string,
  now: Date,
): Promise<void> {
  await releaseCalendarBlockForSession(db, sessionId, now);
}

export { transitionBookingStatus };

function parseLocalTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour: hour!, minute: minute! };
}

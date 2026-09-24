import { z } from "zod";
import type { Database, Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { defineJob, enqueueJob } from "@/server/platform/outbox/outbox";
import { getSetting } from "@/server/platform/settings/settings";
import { findUserById } from "@/server/modules/auth";
import { findMentorProfile, latestAttestation } from "@/server/modules/profiles";
import {
  createFakeGateway,
  hasActivePayoutAccount,
  quoteBooking,
  refundOrderItem,
} from "@/server/modules/payments";
import { deriveSeatPriceMinor, canReduceCapacity, isMinimumMet } from "../domain/group";
import { canTransition, transition } from "../domain/state-machine";
import {
  listBookingsForSession,
  listLiveBookingsForSession,
  transitionBookingStatus,
} from "../infra/booking-repo";
import {
  findSession,
  findSessionForUpdate,
  insertGroupOrEventSession,
  releaseCalendarBlockForSession,
  insertCalendarBlock,
  listSessionsPendingMinCheck,
  setSessionCapacity,
  setSessionStatus,
  type SessionRow,
} from "../infra/session-repo";
import { insertGroupServiceRow } from "../infra/service-repo";
import { notify } from "./notifications";

export type CreateGroupSessionInput = {
  title: string;
  descriptionMd?: string | null;
  start: Date;
  end: Date;
  capacity: number;
  /** Falls back to `group.min_participants_default` when omitted. */
  minParticipants?: number;
  targetTotalMinor: number;
  currency: string;
};

export type SeatPricingPreview = {
  seatPriceMinor: number;
  commissionMinor: number;
  mentorShareMinor: number;
  earningsAtMinParticipantsMinor: number;
  earningsAtCapacityMinor: number;
};

async function requireApprovedPayableMentor(
  db: Executor,
  mentorUserId: string,
  now: Date,
): Promise<void> {
  const mentor = await findMentorProfile(db, mentorUserId);
  if (!mentor || mentor.applicationStatus !== "approved") {
    throw new AppError("BAD_REQUEST", {
      detail: "Only an approved mentor can create a group session.",
    });
  }
  const [payoutAccountActive, attestation] = await Promise.all([
    hasActivePayoutAccount(db, mentorUserId),
    latestAttestation(db, mentorUserId),
  ]);
  const payable =
    mentor.payoutMode === "paid" &&
    payoutAccountActive &&
    attestation !== undefined &&
    attestation.expiresAt > now;
  if (!payable) {
    throw new AppError("BAD_REQUEST", {
      detail:
        "A payout account and a valid work-eligibility attestation are required to sell seats.",
    });
  }
}

function validateCapacity(capacity: number, minParticipants: number, capacityMax: number): void {
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > capacityMax) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        { path: "capacity", code: "out_of_range", message: `Capacity must be 2-${capacityMax}.` },
      ],
    });
  }
  if (!Number.isInteger(minParticipants) || minParticipants < 1 || minParticipants > capacity) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        {
          path: "minParticipants",
          code: "out_of_range",
          message: "Minimum participants must be between 1 and capacity.",
        },
      ],
    });
  }
}

/** Seat-pricing helper (docs/09 §8): derives the per-seat price from a target total and shows what
 * the mentor would actually earn (after commission) at both the minimum and maximum fill, before
 * they publish. Read-only — `quoteBooking` never writes anything. */
export async function previewGroupSeatPricing(
  db: Database,
  mentorUserId: string,
  input: { targetTotalMinor: number; capacity: number; minParticipants: number; currency: string },
  now: Date,
): Promise<SeatPricingPreview> {
  const capacityMax = await getSetting(db, "group.capacity_max", now);
  validateCapacity(input.capacity, input.minParticipants, capacityMax);
  const seatPriceMinor = deriveSeatPriceMinor(input.targetTotalMinor, input.capacity);
  const quote = await quoteBooking(db, {
    baseMinor: seatPriceMinor,
    currency: input.currency,
    serviceKind: "group",
    categoryId: null,
    mentorUserId,
    promoCode: null,
    now,
  });
  return {
    seatPriceMinor,
    commissionMinor: quote.commissionMinor,
    mentorShareMinor: quote.mentorShareMinor,
    earningsAtMinParticipantsMinor: quote.mentorShareMinor * input.minParticipants,
    earningsAtCapacityMinor: quote.mentorShareMinor * input.capacity,
  };
}

export type CreateGroupSessionResult = { session: SessionRow; seatPriceMinor: number };

export async function createGroupSession(
  db: Database,
  mentorUserId: string,
  input: CreateGroupSessionInput,
  now: Date,
): Promise<CreateGroupSessionResult> {
  await requireApprovedPayableMentor(db, mentorUserId, now);
  const [capacityMax, minSeatPriceMinor, registrationCloseBeforeMin, minCheckBeforeHours] =
    await Promise.all([
      getSetting(db, "group.capacity_max", now),
      getSetting(db, "group.min_seat_price_minor", now),
      getSetting(db, "group.registration_close_before_min", now),
      getSetting(db, "group.min_check_before_hours", now),
    ]);
  const minParticipants =
    input.minParticipants ?? (await getSetting(db, "group.min_participants_default", now));
  validateCapacity(input.capacity, minParticipants, capacityMax);
  if (input.end <= input.start) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "end", code: "invalid_range", message: "End must be after start." }],
    });
  }

  const seatPriceMinor = deriveSeatPriceMinor(input.targetTotalMinor, input.capacity);
  if (seatPriceMinor < minSeatPriceMinor) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        {
          path: "targetTotalMinor",
          code: "below_minimum",
          message: `Seat price would be below the ${minSeatPriceMinor}-minor-unit floor.`,
        },
      ],
    });
  }

  const registrationClosesAt = new Date(
    input.start.getTime() - registrationCloseBeforeMin * 60_000,
  );
  const minParticipantsCheckAt = new Date(input.start.getTime() - minCheckBeforeHours * 3_600_000);
  if (now >= registrationClosesAt) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        { path: "start", code: "too_soon", message: "Session starts too soon to schedule." },
      ],
    });
  }

  return db.transaction(async (tx) => {
    const service = await insertGroupServiceRow(tx, {
      mentorUserId,
      title: input.title,
      descriptionMd: input.descriptionMd ?? null,
    });
    const session = await insertGroupOrEventSession(tx, {
      kind: "group",
      hostUserId: mentorUserId,
      serviceId: service.id,
      start: input.start,
      end: input.end,
      capacity: input.capacity,
      minParticipants,
      seatPriceMinor,
      currency: input.currency,
      registrationClosesAt,
      minParticipantsCheckAt,
      meetingProvider: null,
      meetingUrl: null,
    });
    // One calendar block for the whole session (docs/09 §6.2) — never per-seat, unlike 1:1.
    await insertCalendarBlock(tx, {
      mentorId: mentorUserId,
      sourceType: "session",
      sourceId: session.id,
      start: input.start,
      end: input.end,
    });
    await enqueueJob(
      tx,
      checkGroupMinParticipants,
      { sessionId: session.id },
      { runAt: minParticipantsCheckAt, dedupeKey: `session:${session.id}:min-check` },
    );
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: mentorUserId,
      action: "session.group_created",
      targetType: "session",
      targetId: session.id,
      metadata: { capacity: input.capacity, minParticipants, seatPriceMinor },
    });
    return { session, seatPriceMinor };
  });
}

/** docs/18 B25: capacity may never drop below seats already live. */
export async function updateGroupSessionCapacity(
  db: Database,
  mentorUserId: string,
  sessionId: string,
  capacity: number,
  now: Date,
): Promise<SessionRow> {
  const capacityMax = await getSetting(db, "group.capacity_max", now);
  return db.transaction(async (tx) => {
    const session = await findSessionForUpdate(tx, sessionId);
    if (!session || session.hostUserId !== mentorUserId || session.kind !== "group") {
      throw new AppError("NOT_FOUND");
    }
    validateCapacity(capacity, session.minParticipants, capacityMax);
    const liveBookings = await listLiveBookingsForSession(tx, sessionId);
    if (!canReduceCapacity(capacity, liveBookings.length)) {
      throw new AppError("VALIDATION_FAILED", {
        errors: [
          {
            path: "capacity",
            code: "below_confirmed",
            message: `Capacity can't drop below the ${liveBookings.length} seat(s) already live.`,
          },
        ],
      });
    }
    await setSessionCapacity(tx, sessionId, capacity);
    return { ...session, capacity };
  });
}

/** Shared by the min-participants auto-cancel, mentor-initiated group cancel, and (from
 * `events.ts`) host-initiated event cancel — the same "cancel every live seat, refund what was
 * captured, notify" shape applies to any multi-seat session kind. */
export async function cancelEverySeatAndRefund(
  tx: Executor,
  session: SessionRow,
  now: Date,
  reasonCode: string,
  refundPct: number,
  auditAction: string,
): Promise<{ cancelledSeats: number; refundedSeats: number }> {
  await setSessionStatus(tx, session.id, "cancelled");
  await releaseCalendarBlockForSession(tx, session.id, now);

  const allBookings = await listBookingsForSession(tx, session.id);
  const gateway = createFakeGateway(tx);
  let cancelledSeats = 0;
  let refundedSeats = 0;
  for (const booking of allBookings) {
    if (!canTransition(booking.status, "system_cancel")) continue;
    const wasConfirmed = booking.status === "confirmed";
    const result = transition(booking.status, "system_cancel");
    const updated = await transitionBookingStatus(tx, booking.id, booking.version, result.to, now);
    if (!updated) continue;
    cancelledSeats += 1;

    if (wasConfirmed && booking.orderItemId && refundPct > 0) {
      const refundMinor = Math.floor((booking.priceMinor * refundPct) / 100);
      if (refundMinor > 0) {
        await refundOrderItem(
          tx,
          gateway,
          {
            orderItemId: booking.orderItemId,
            refundMinor,
            reasonCode,
            initiatedBy: "system",
            idempotencyKey: `${reasonCode}:${booking.id}`,
          },
          now,
        );
        refundedSeats += 1;
      }
    }

    const student = await findUserById(tx, booking.studentId);
    if (student) {
      await notify(
        tx,
        student.email,
        "Session cancelled",
        "The group session you registered for was cancelled. Any payment you made is being refunded in full.",
      );
    }
  }

  await writeAudit(tx, {
    actorType: "system",
    action: auditAction,
    targetType: "session",
    targetId: session.id,
    metadata: { cancelledSeats, refundedSeats },
  });
  return { cancelledSeats, refundedSeats };
}

/**
 * The min-participants check (docs/09 §8) — scheduled once per session at creation time
 * (`checkGroupMinParticipants`'s `dedupeKey`), no explicit job spec exists in the docs beyond "at
 * the deadline: confirmed or auto-cancelled with full refunds", so this follows the same
 * lock-then-verify shape as the seat-booking transaction it races against.
 */
export async function checkGroupMinParticipantsOnce(
  db: Database,
  sessionId: string,
  now: Date,
): Promise<{ cancelled: boolean }> {
  return db.transaction(async (tx) => {
    const session = await findSessionForUpdate(tx, sessionId);
    if (!session || session.kind !== "group" || session.status !== "scheduled") {
      return { cancelled: false }; // already handled (idempotent) or not applicable
    }
    const liveBookings = await listLiveBookingsForSession(tx, sessionId);
    if (isMinimumMet(liveBookings.length, session.minParticipants)) return { cancelled: false };

    const refundPct = await getSetting(tx, "group.min_participants_unmet_refund_pct", now);
    await cancelEverySeatAndRefund(
      tx,
      session,
      now,
      "group_min_not_met",
      refundPct,
      "session.group_cancelled_min_not_met",
    );
    return { cancelled: true };
  });
}

export const checkGroupMinParticipants = defineJob({
  type: "booking.check_group_min_participants",
  schema: z.object({ sessionId: z.uuid() }),
  maxAttempts: 5,
  async handle(payload, { db, clock }) {
    await checkGroupMinParticipantsOnce(db, payload.sessionId, clock.now());
  },
});

/** Belt-and-suspenders recurring sweep (matches the payment sweeper's own precedent, docs/08 §10)
 * alongside the per-session scheduled job above — catches a session whose scheduled check was
 * somehow missed (a dropped dedupe row, a job that never got created before a migration/deploy). */
export async function sweepOverdueMinParticipantsChecks(db: Database, now: Date): Promise<number> {
  const due = await listSessionsPendingMinCheck(db, now);
  for (const session of due) {
    await checkGroupMinParticipantsOnce(db, session.id, now);
  }
  return due.length;
}

/** Mentor-initiated cancellation of a group session (docs/18 B20) — always a full refund to every
 * seat, unlike the min-participants path which respects the configurable percentage. */
export async function cancelGroupSession(
  db: Database,
  mentorUserId: string,
  sessionId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await findSessionForUpdate(tx, sessionId);
    if (!session || session.hostUserId !== mentorUserId || session.kind !== "group") {
      throw new AppError("NOT_FOUND");
    }
    if (session.status !== "scheduled") {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "This session isn't cancellable." });
    }
    await cancelEverySeatAndRefund(
      tx,
      session,
      now,
      "mentor_cancel",
      100,
      "session.group_cancelled_by_mentor",
    );
  });
}

export type LiveGroupSession = { session: SessionRow; liveSeats: number };

export async function getGroupSessionForMentor(
  db: Database,
  mentorUserId: string,
  sessionId: string,
): Promise<LiveGroupSession> {
  const session = await findSession(db, sessionId);
  if (!session || session.hostUserId !== mentorUserId || session.kind !== "group") {
    throw new AppError("NOT_FOUND");
  }
  const liveBookings = await listLiveBookingsForSession(db, sessionId);
  return { session, liveSeats: liveBookings.length };
}

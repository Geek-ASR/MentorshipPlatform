import type { Database, Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import {
  createFakeGateway,
  findOrderItemByBooking,
  refundOrderItem,
} from "@/server/modules/payments";
import {
  findBooking,
  findSession,
  sessionWindow,
  transitionBookingStatus,
  type BookingRow,
} from "@/server/modules/booking";
import { refundMinorFor } from "../domain/dispute-math";
import type { DisputeEvidenceKind, DisputeResolution, DisputeStatus } from "../domain/types";
import {
  closeDispute,
  findDispute,
  findDisputeByBooking,
  insertDispute,
  insertDisputeEvidence,
  listDisputes as listDisputesRow,
  listEvidenceForDispute,
  listOpenDisputesPastEvidenceDeadline,
  listResolvedDisputesPastAppealDeadline,
  resolveDispute as resolveDisputeRow,
  setDisputeStatus,
  type DisputeEvidenceRow,
  type DisputeRow,
} from "../infra/disputes-repo";
import { excuseTrustEventsFromSource } from "../infra/trust-events-repo";
import { findReviewByBooking, setReviewStatus as setReviewStatusRow } from "../infra/reviews-repo";

const DISPUTE_HOLD_REASON = "dispute_open";

const DISPUTE_WINDOW_HOURS = 72; // docs/10 §8: "participant disputes (≤ 72 h after end)".
const EVIDENCE_WINDOW_HOURS = 48; // docs/10 §8: "both parties asked for evidence (48 h)".
const APPEAL_WINDOW_DAYS = 7; // docs/10 §8: "party appeals (≤ 7 days, once)".

/** Statuses a booking can be manually disputed from — the two non-`awaiting_outcome` transitions
 * booking's own (unexported) state machine allows into `disputed` (`no_show_contested`,
 * `review_dispute_opened`); a conflicting-attendance-claim dispute is opened automatically by the
 * attendance finalizer itself and never reaches here. */
const DISPUTABLE_BOOKING_STATUSES = new Set<BookingRow["status"]>([
  "no_show_mentor",
  "no_show_student",
  "completed",
]);

async function loadDisputeParticipant(
  executor: Executor,
  userId: string,
  bookingId: string,
): Promise<{ booking: BookingRow; mentorUserId: string; sessionEnd: Date }> {
  const booking = await findBooking(executor, bookingId);
  if (!booking) throw new AppError("NOT_FOUND");
  const session = await findSession(executor, booking.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  const isParticipant = booking.studentId === userId || session.hostUserId === userId;
  if (!isParticipant) throw new AppError("NOT_FOUND");
  return { booking, mentorUserId: session.hostUserId, sessionEnd: sessionWindow(session).end };
}

export async function openDispute(
  db: Database,
  actorUserId: string,
  bookingId: string,
  now: Date,
): Promise<DisputeRow> {
  return db.transaction(async (tx) => {
    const { booking, sessionEnd } = await loadDisputeParticipant(tx, actorUserId, bookingId);
    if (!DISPUTABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This booking can't be disputed from its current state.",
      });
    }
    const hoursSinceEnd = (now.getTime() - sessionEnd.getTime()) / 3_600_000;
    if (hoursSinceEnd > DISPUTE_WINDOW_HOURS) {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "The window to dispute this session has closed.",
      });
    }
    const existing = await findDisputeByBooking(tx, bookingId);
    if (existing) {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This session is already disputed.",
      });
    }

    // Both of booking's legal entries into `disputed` from here (`no_show_contested`,
    // `review_dispute_opened`) land on the same target status — see `DISPUTABLE_BOOKING_STATUSES`.
    const updated = await transitionBookingStatus(tx, bookingId, booking.version, "disputed", now);
    if (!updated) throw new AppError("CONFLICT");

    const evidenceDeadlineAt = new Date(now.getTime() + EVIDENCE_WINDOW_HOURS * 3_600_000);
    const dispute = await insertDispute(tx, {
      bookingId,
      openedByUserId: actorUserId,
      openedAt: now,
      evidenceDeadlineAt,
    });
    await setDisputeStatus(tx, dispute.id, "awaiting_evidence");

    // docs/10 §10 "During a dispute: Held until resolution" — a review can already exist here only
    // when the dispute came from `review_dispute_opened` (a money dispute on an already-completed,
    // already-reviewed session); a no-show contest has no review yet, since `createReview` requires
    // `completed`.
    const existingReview = await findReviewByBooking(tx, bookingId);
    if (existingReview && existingReview.status === "published") {
      await setReviewStatusRow(tx, existingReview.id, "held", now, DISPUTE_HOLD_REASON);
    }

    await writeAudit(tx, {
      actorType: "user",
      actorUserId,
      action: "trust.dispute_opened",
      targetType: "booking",
      targetId: bookingId,
      metadata: { disputeId: dispute.id, fromStatus: booking.status },
    });

    return { ...dispute, status: "awaiting_evidence" };
  });
}

export async function submitDisputeEvidence(
  db: Database,
  actorUserId: string,
  disputeId: string,
  input: { kind: DisputeEvidenceKind; content: string | null },
): Promise<DisputeEvidenceRow> {
  return db.transaction(async (tx) => {
    const dispute = await findDispute(tx, disputeId);
    if (!dispute) throw new AppError("NOT_FOUND");
    if (dispute.status !== "awaiting_evidence") {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This dispute is no longer accepting evidence.",
      });
    }
    await loadDisputeParticipant(tx, actorUserId, dispute.bookingId); // throws NOT_FOUND if not a party.

    const evidence = await insertDisputeEvidence(tx, {
      disputeId,
      submittedByUserId: actorUserId,
      kind: input.kind,
      content: input.content,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId,
      action: "trust.dispute_evidence_submitted",
      targetType: "dispute",
      targetId: disputeId,
      metadata: { kind: input.kind },
    });
    return evidence;
  });
}

export async function listDisputeEvidence(
  db: Database,
  disputeId: string,
): Promise<DisputeEvidenceRow[]> {
  return listEvidenceForDispute(db, disputeId);
}

/** docs/06 §7.8 `GET /disputes/{id}` — participant-only read. */
export async function getDisputeForParticipant(
  db: Database,
  actorUserId: string,
  disputeId: string,
): Promise<DisputeRow> {
  const dispute = await findDispute(db, disputeId);
  if (!dispute) throw new AppError("NOT_FOUND");
  await loadDisputeParticipant(db, actorUserId, dispute.bookingId); // throws NOT_FOUND if not a party.
  return dispute;
}

export async function getDisputeForAdmin(db: Database, disputeId: string): Promise<DisputeRow> {
  const dispute = await findDispute(db, disputeId);
  if (!dispute) throw new AppError("NOT_FOUND");
  return dispute;
}

/** docs/06 §7.9 `GET /admin/disputes`. */
export async function listDisputesForAdmin(
  db: Database,
  options: { status?: DisputeStatus } = {},
): Promise<DisputeRow[]> {
  return listDisputesRow(db, options);
}

/** Sweep (docs/10 §8: "evidence received or deadline passed") — moves any `awaiting_evidence`
 * dispute whose 48 h window has passed into `under_review` for a moderator to decide. */
export async function sweepDisputeEvidenceDeadlines(db: Database, now: Date): Promise<number> {
  const due = await listOpenDisputesPastEvidenceDeadline(db, now);
  for (const dispute of due) {
    await db.transaction(async (tx) => {
      await setDisputeStatus(tx, dispute.id, "under_review");
      await writeAudit(tx, {
        actorType: "system",
        action: "trust.dispute_evidence_deadline_passed",
        targetType: "dispute",
        targetId: dispute.id,
        metadata: {},
      });
    });
  }
  return due.length;
}

export type ResolveDisputeInput = {
  disputeId: string;
  resolution: DisputeResolution;
  atFaultUserId: string | null;
  /** Only meaningful for `partial_refund` — defaults to a 50/50 split (docs/10 §8's worked example). */
  partialRefundPct?: number;
  rationale: string;
  decidedBy: string;
};

/**
 * Resolves a dispute under review (docs/10 §8). Computes the refund amount via `dispute-math`,
 * moves money through payments' already-built `refundOrderItem` when the resolution isn't
 * `no_refund`, and transitions the booking using its own two legal exits from `disputed` (docs/09
 * §7.1): `completed` when nothing is refunded (mentor not at fault), `resolved_refunded` otherwise —
 * reusing `resolved_refunded` for every refund > 0, not only a literal 100% refund (the state
 * machine's own `refund_full` intent label was never programmatically tied to "100%" anywhere).
 *
 * When the dispute originated from a contested no-show finding and resolves *for* the mentor (no
 * refund — the original no-show call was wrong), the trust event that finding produced is excused
 * (`excuseTrustEventsFromSource`, keyed by booking id — see the ingestion poller). When it resolves
 * against the mentor, no new event is fabricated here: the ingestion poller already recorded the
 * matching `mentor_no_show`/`student_no_show` event from the original finalizer signal, and
 * `recordTrustEvent`'s own idempotency means calling it again would be a no-op — so this function
 * simply doesn't duplicate that work for the no-show case, and doesn't invent a new catalog event
 * type for a non-no-show ("review_dispute_opened") money dispute, since docs/10 §4.2 defines no such
 * type (documented scope boundary, docs/19 Phase 10 retrospective).
 *
 * One consequence worth naming explicitly: a mentor no-show already auto-refunds the student in
 * full the moment attendance finalises (docs/10 §5 Level 0, wired into `booking`'s attendance
 * finaliser this same phase). If a mentor later disputes that finding and wins (`refundMinor === 0`
 * here), this function does *not* claw back that earlier refund — it only excuses the trust event.
 * Recovering money from a student after the fact is the same "never reverse a processed refund"
 * scope boundary `decideDisputeAppeal` documents below, applied one step earlier.
 */
export async function resolveDispute(
  db: Database,
  input: ResolveDisputeInput,
  now: Date,
): Promise<DisputeRow> {
  return db.transaction(async (tx) => {
    const dispute = await findDispute(tx, input.disputeId);
    if (!dispute) throw new AppError("NOT_FOUND");
    if (dispute.status !== "under_review") {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This dispute isn't ready for a decision.",
      });
    }
    const booking = await findBooking(tx, dispute.bookingId);
    if (!booking) throw new AppError("NOT_FOUND");

    const refundPct =
      input.resolution === "partial_refund"
        ? (input.partialRefundPct ?? 50)
        : refundPctFor(input.resolution);
    const refundMinor = refundMinorFor(booking.priceMinor, refundPct);

    const appealDeadlineAt = new Date(now.getTime() + APPEAL_WINDOW_DAYS * 86_400_000);
    const resolved = await resolveDisputeRow(tx, input.disputeId, {
      resolution: input.resolution,
      refundPct,
      atFaultUserId: input.atFaultUserId,
      decidedBy: input.decidedBy,
      resolvedAt: now,
      appealDeadlineAt,
    });
    if (!resolved) throw new AppError("NOT_FOUND");

    const wasNoShowContest =
      booking.status === "no_show_mentor" || booking.status === "no_show_student";
    const to = refundMinor > 0 ? "resolved_refunded" : "completed";
    const updated = await transitionBookingStatus(tx, booking.id, booking.version, to, now);
    if (!updated) throw new AppError("CONFLICT");

    if (refundMinor > 0 && booking.orderItemId) {
      const orderItem = await findOrderItemByBooking(tx, booking.id);
      if (orderItem) {
        const gateway = createFakeGateway(tx);
        await refundOrderItem(
          tx,
          gateway,
          {
            orderItemId: orderItem.id,
            refundMinor,
            reasonCode: `dispute_resolved:${input.resolution}`,
            initiatedBy: "staff",
            idempotencyKey: `dispute-refund:${dispute.id}`,
          },
          now,
        );
      }
    }

    if (wasNoShowContest && refundMinor === 0) {
      await excuseTrustEventsFromSource(
        tx,
        "booking",
        booking.id,
        `dispute_resolved_no_fault:${dispute.id}`,
      );
    }

    // Restore the review this dispute held on open (docs/10 §10) — a content-policy hold from
    // `runPublicationCheck` also lands on `held`, but carries a different, non-empty `heldReason`, so
    // this only ever un-holds the specific hold this module itself placed.
    const heldReview = await findReviewByBooking(tx, booking.id);
    if (
      heldReview &&
      heldReview.status === "held" &&
      heldReview.heldReason === DISPUTE_HOLD_REASON
    ) {
      await setReviewStatusRow(tx, heldReview.id, "published", now, null);
    }

    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: input.decidedBy,
      action: "trust.dispute_resolved",
      targetType: "dispute",
      targetId: dispute.id,
      metadata: {
        resolution: input.resolution,
        refundPct,
        refundMinor,
        atFaultUserId: input.atFaultUserId,
      },
    });

    return resolved;
  });
}

function refundPctFor(resolution: DisputeResolution): number {
  if (resolution === "full_refund") return 100;
  if (resolution === "no_refund") return 0;
  return 50; // Only reached if `partial_refund` slips through without an explicit pct — a safe default.
}

/** docs/10 §8: "party appeals (≤ 7 days, once)" — a dispute's own appeal step, distinct from
 * `appeals.ts`'s appeal of a `moderation_actions` row. */
export async function appealDisputeResolution(
  db: Database,
  actorUserId: string,
  disputeId: string,
  now: Date,
): Promise<DisputeRow> {
  return db.transaction(async (tx) => {
    const dispute = await findDispute(tx, disputeId);
    if (!dispute) throw new AppError("NOT_FOUND");
    if (dispute.status !== "resolved") {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "This dispute isn't appealable." });
    }
    if (!dispute.appealDeadlineAt || now > dispute.appealDeadlineAt) {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "The appeal window has closed." });
    }
    await loadDisputeParticipant(tx, actorUserId, dispute.bookingId);

    await setDisputeStatus(tx, disputeId, "appealed");
    await writeAudit(tx, {
      actorType: "user",
      actorUserId,
      action: "trust.dispute_appealed",
      targetType: "dispute",
      targetId: disputeId,
      metadata: {},
    });
    const updated = await findDispute(tx, disputeId);
    return updated!;
  });
}

/** docs/10 §8: "resolved --> closed: appeal window passes" — sweeps every `resolved` dispute whose
 * appeal deadline has passed straight to `closed` with no further action. */
export async function sweepDisputeAppealDeadlines(db: Database, now: Date): Promise<number> {
  const due = await listResolvedDisputesPastAppealDeadline(db, now);
  for (const dispute of due) {
    await closeDispute(db, dispute.id, now);
  }
  return due.length;
}

export type DecideDisputeAppealInput = {
  disputeId: string;
  reviewerId: string;
  /** Whether the original decision stands. Overturning a dispute appeal can change the at-fault
   * finding and any trust events (excused here when overturned), but deliberately never reverses
   * money already refunded through `refundOrderItem` — re-charging a student's payment method to
   * claw back a processed refund is its own workflow this phase doesn't build (documented deviation,
   * matching real dispute/chargeback appeal limitations elsewhere). */
  upheld: boolean;
  rationale: string;
};

export async function decideDisputeAppeal(
  db: Database,
  input: DecideDisputeAppealInput,
  now: Date,
): Promise<DisputeRow> {
  return db.transaction(async (tx) => {
    const dispute = await findDispute(tx, input.disputeId);
    if (!dispute) throw new AppError("NOT_FOUND");
    if (dispute.status !== "appealed") {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This dispute has no open appeal.",
      });
    }

    if (!input.upheld) {
      await excuseTrustEventsFromSource(
        tx,
        "booking",
        dispute.bookingId,
        `dispute_appeal_overturned:${input.disputeId}`,
      );
    }

    await closeDispute(tx, input.disputeId, now);
    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: input.reviewerId,
      action: "trust.dispute_appeal_decided",
      targetType: "dispute",
      targetId: input.disputeId,
      metadata: { upheld: input.upheld, rationale: input.rationale },
    });

    const updated = await findDispute(tx, input.disputeId);
    return updated!;
  });
}

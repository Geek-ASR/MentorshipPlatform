import type { Database } from "@/server/platform/db/client";
import { isAppError } from "@/server/platform/errors";
import { parseTstzRange } from "@/server/platform/db/sql-helpers";
import { findUsersByIds, listMyBlocks } from "@/server/modules/auth";
import { findMentorProfile } from "@/server/modules/profiles";
import {
  attendanceClaimWindow,
  findPendingReschedule,
  findSession,
  findSessionTitles,
  getBookingForUser,
  listClaimsForBooking,
  type AttendanceClaimOutcome,
} from "@/server/modules/booking";
import { getCheckoutState, listPaymentHistoryForStudent } from "@/server/modules/payments";
import {
  DISPUTE_WINDOW_HOURS,
  REVIEW_WINDOW_DAYS,
  findDisputeByBooking,
  findReviewByBooking,
  listDisputeEvidence,
  type DisputeEvidenceKind,
  type DisputeStatus,
  type ReviewStatus,
} from "@/server/modules/trust";
import type { BookingStatusName } from "./sessions";

export type CancellationPolicyView = {
  fullRefundHours: number;
  partialRefundHours: number;
  partialRefundPct: number;
  lateRefundPct: number;
  mentorRefundPct: number;
};

export type PersonView = {
  userId: string;
  name: string;
  timezone: string;
  slug: string | null;
  headline: string | null;
};

export type BookingDetailView = {
  role: "student" | "mentor";
  id: string;
  status: BookingStatusName;
  priceMinor: number;
  currency: string;
  createdAt: Date;
  confirmedAt: Date | null;
  holdExpiresAt: Date | null;
  intakeAnswers: { questionId: string; value: string }[];
  policy: CancellationPolicyView | null;
  session: {
    id: string;
    kind: "one_on_one" | "group" | "event";
    serviceId: string | null;
    title: string;
    eventSlug: string | null;
    start: Date;
    end: Date;
    durationMin: number;
  };
  mentor: PersonView;
  student: PersonView;
  /** Student view only: what was paid, and how much has come back. */
  payment: { amountMinor: number; refundedMinor: number; currency: string; paidAt: Date } | null;
  /** Student view only, while the booking is being paid: the provider order and the hold. */
  checkout: { providerOrderId: string; status: string; holdExpiresAt: Date | null } | null;
  pendingReschedule: {
    id: string;
    requestedBy: "student" | "mentor";
    start: Date;
    end: Date;
    expiresAt: Date | null;
  } | null;
  /** After the session: how it went, the review, and any dispute (docs/09 §11, docs/10 §8, §10). */
  outcome: {
    /** Set while this person can still tell us how it went; absence claims open after a grace. */
    claim: { opensAt: Date; absenceOpensAt: Date } | null;
    myClaim: { outcome: AttendanceClaimOutcome; note: string | null } | null;
    /** Student only. */
    review: {
      rating: number;
      body: string;
      status: ReviewStatus;
      publishedAt: Date | null;
    } | null;
    reviewClosesAt: Date | null;
    dispute: {
      id: string;
      status: DisputeStatus;
      openedByMe: boolean;
      evidenceDeadlineAt: Date | null;
      resolution: string | null;
      refundPct: number | null;
      myEvidence: { kind: DisputeEvidenceKind; content: string | null; createdAt: Date }[];
    } | null;
    disputeClosesAt: Date | null;
  };
  /** Whether the viewer has blocked the other participant. */
  otherBlocked: boolean;
};

const CLAIMABLE_STATUSES = new Set(["confirmed", "awaiting_outcome"]);
const DISPUTABLE_STATUSES = new Set(["completed", "no_show_mentor", "no_show_student"]);

async function person(
  db: Database,
  userId: string,
  people: Map<string, { displayName: string; timezone: string }>,
): Promise<PersonView> {
  const profile = await findMentorProfile(db, userId);
  const user = people.get(userId);
  return {
    userId,
    name: user?.displayName ?? "Former member",
    timezone: user?.timezone ?? "UTC",
    slug: profile?.isListed ? profile.slug : null,
    headline: profile?.headline ?? null,
  };
}

/**
 * Everything the booking page shows (docs/22 §3 J1 steps 4–5), for either participant. Anyone
 * else — including a signed-in stranger with a guessed id — gets null, rendered as a 404.
 */
export async function loadBookingDetail(
  db: Database,
  viewerId: string,
  bookingId: string,
  now: Date = new Date(),
): Promise<BookingDetailView | null> {
  let booking: Awaited<ReturnType<typeof getBookingForUser>>;
  try {
    booking = await getBookingForUser(db, viewerId, bookingId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  }
  const role = booking.studentId === viewerId ? "student" : "mentor";
  const [session, titles, users, pending, claims, review, dispute, blocks] = await Promise.all([
    findSession(db, booking.sessionId),
    findSessionTitles(db, [booking.sessionId]),
    findUsersByIds(db, [booking.studentId, booking.mentorUserId]),
    findPendingReschedule(db, booking.id),
    listClaimsForBooking(db, booking.id),
    findReviewByBooking(db, booking.id),
    findDisputeByBooking(db, booking.id),
    listMyBlocks(db, viewerId),
  ]);
  if (!session) return null;
  const otherUserId = role === "student" ? booking.mentorUserId : booking.studentId;

  const claimWindow =
    CLAIMABLE_STATUSES.has(booking.status) && now >= booking.start
      ? await attendanceClaimWindow(db, session, now)
      : null;
  const myClaim = claims.find((c) => c.claimantUserId === viewerId);
  const reviewClosesAt = new Date(booking.end.getTime() + REVIEW_WINDOW_DAYS * 86_400_000);
  const disputeClosesAt = new Date(booking.end.getTime() + DISPUTE_WINDOW_HOURS * 3_600_000);
  const evidence = dispute ? await listDisputeEvidence(db, dispute.id) : [];
  const people = new Map(users.map((u) => [u.id, u]));
  const [mentor, student] = await Promise.all([
    person(db, booking.mentorUserId, people),
    person(db, booking.studentId, people),
  ]);

  let payment: BookingDetailView["payment"] = null;
  let checkout: BookingDetailView["checkout"] = null;
  if (role === "student" && booking.orderItemId) {
    const [history, state] = await Promise.all([
      listPaymentHistoryForStudent(db, booking.studentId),
      getCheckoutState(db, booking.orderItemId),
    ]);
    const paid = history.find((row) => row.bookingId === booking.id);
    if (paid) {
      payment = {
        amountMinor: paid.amountMinor,
        refundedMinor: paid.refundedMinor,
        currency: paid.currency,
        paidAt: paid.paidAt,
      };
    }
    if (state) {
      checkout = {
        providerOrderId: state.providerOrderId,
        status: state.status,
        holdExpiresAt: state.holdExpiresAt,
      };
    }
  }

  const title = titles.get(booking.sessionId);
  const policy = (booking.policySnapshot as { cancellation?: CancellationPolicyView }).cancellation;
  const proposed = pending ? parseTstzRange(pending.proposedDuring) : null;
  return {
    role,
    id: booking.id,
    status: booking.status,
    priceMinor: booking.priceMinor,
    currency: booking.currency,
    createdAt: booking.createdAt,
    confirmedAt: booking.confirmedAt,
    holdExpiresAt: booking.holdExpiresAt,
    intakeAnswers: booking.intakeAnswers,
    policy: policy ?? null,
    session: {
      id: session.id,
      kind: session.kind,
      serviceId: session.serviceId,
      title: title?.title ?? "Session",
      eventSlug: title?.eventSlug ?? null,
      start: booking.start,
      end: booking.end,
      durationMin: Math.round((booking.end.getTime() - booking.start.getTime()) / 60_000),
    },
    mentor,
    student,
    payment,
    checkout,
    pendingReschedule:
      pending && proposed
        ? {
            id: pending.id,
            requestedBy: pending.requestedBy,
            start: proposed.start,
            end: proposed.end,
            expiresAt: pending.expiresAt,
          }
        : null,
    outcome: {
      claim: claimWindow,
      myClaim: myClaim ? { outcome: myClaim.outcome, note: myClaim.note } : null,
      review:
        role === "student" && review
          ? {
              rating: review.rating,
              body: review.body,
              status: review.status,
              publishedAt: review.publishedAt,
            }
          : null,
      reviewClosesAt:
        role === "student" && !review && booking.status === "completed" && now < reviewClosesAt
          ? reviewClosesAt
          : null,
      dispute: dispute
        ? {
            id: dispute.id,
            status: dispute.status,
            openedByMe: dispute.openedByUserId === viewerId,
            evidenceDeadlineAt: dispute.evidenceDeadlineAt,
            resolution: dispute.resolution,
            refundPct: dispute.refundPct,
            // Each side sees only what it sent — the other party's evidence goes to staff alone.
            myEvidence: evidence
              .filter((e) => e.submittedByUserId === viewerId)
              .map((e) => ({ kind: e.kind, content: e.content, createdAt: e.createdAt })),
          }
        : null,
      disputeClosesAt:
        !dispute && DISPUTABLE_STATUSES.has(booking.status) && now < disputeClosesAt
          ? disputeClosesAt
          : null,
    },
    otherBlocked: blocks.some((b) => b.blockedId === otherUserId),
  };
}

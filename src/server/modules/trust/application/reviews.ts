import type { Database, Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { findBooking, findSession, sessionWindow } from "@/server/modules/booking";
import {
  containsProfanity,
  detectClaimPhrases,
  detectContactInfo,
  hasPaymentSolicitation,
  shouldHoldForModeration,
  type ReviewPublicationCheck,
} from "../domain/detectors";
import type { ReviewStatus } from "../domain/types";
import { addCaseEvent, insertCase } from "../infra/moderation-repo";
import {
  findReview,
  findReviewByBooking,
  findReviewResponse,
  insertReview,
  insertReviewResponse,
  listRecentReviewsByAuthor,
  setReviewStatus,
  updateReviewBody,
  type ReviewResponseRow,
  type ReviewRow,
} from "../infra/reviews-repo";
import { recomputeMentorStats } from "./reliability";

const REVIEW_WINDOW_DAYS = 14; // docs/10 §10: "Window: 14 days after completion".
const EDIT_WINDOW_HOURS = 48; // docs/10 §10: "editable for 48 h after posting".
const DUPLICATE_LOOKBACK_DAYS = 180;

type PublicationOutcome = {
  status: ReviewStatus;
  heldReason: string | null;
  check: ReviewPublicationCheck;
};

async function runPublicationCheck(
  executor: Executor,
  authorUserId: string,
  body: string,
  now: Date,
): Promise<PublicationOutcome> {
  const contactHits = detectContactInfo(body);
  const since = new Date(now.getTime() - DUPLICATE_LOOKBACK_DAYS * 86_400_000);
  const priorReviews = await listRecentReviewsByAuthor(executor, authorUserId, since);
  const normalized = body.trim().toLowerCase();
  const duplicateText = priorReviews.some((r) => r.body.trim().toLowerCase() === normalized);

  const check: ReviewPublicationCheck = {
    profanity: containsProfanity(body),
    contactInfo: contactHits.length > 0 || hasPaymentSolicitation(contactHits),
    claimPhrases: detectClaimPhrases(body).length > 0,
    duplicateText,
  };
  const held = shouldHoldForModeration(check);
  return {
    status: held ? "held" : "published",
    heldReason: held
      ? Object.entries(check)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(",")
      : null,
    check,
  };
}

async function openContentCase(
  executor: Executor,
  targetType: "review" | "review_response",
  targetId: string,
  check: ReviewPublicationCheck,
): Promise<void> {
  const openedCase = await insertCase(executor, { targetType, targetId, proposedByRuleId: null });
  await addCaseEvent(executor, {
    caseId: openedCase.id,
    kind: "content_held",
    payload: { targetType, targetId, check },
  });
}

export type CreateReviewInput = { rating: number; body: string };

/** docs/10 §10: only the student on a `completed` booking, within 14 days, one per booking. */
export async function createReview(
  db: Database,
  actorUserId: string,
  bookingId: string,
  input: CreateReviewInput,
  now: Date,
): Promise<ReviewRow> {
  if (input.rating < 1 || input.rating > 5) {
    throw new AppError("VALIDATION_FAILED", { detail: "Rating must be between 1 and 5." });
  }

  return db.transaction(async (tx) => {
    const booking = await findBooking(tx, bookingId);
    if (!booking) throw new AppError("NOT_FOUND");
    if (booking.studentId !== actorUserId) throw new AppError("FORBIDDEN");
    if (booking.status !== "completed") {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "Only completed sessions can be reviewed.",
      });
    }
    const session = await findSession(tx, booking.sessionId);
    if (!session) throw new AppError("NOT_FOUND");
    const daysSinceEnd = (now.getTime() - sessionWindow(session).end.getTime()) / 86_400_000;
    if (daysSinceEnd > REVIEW_WINDOW_DAYS) {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "The review window has closed." });
    }
    const existing = await findReviewByBooking(tx, bookingId);
    if (existing) {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This session already has a review.",
      });
    }

    const outcome = await runPublicationCheck(tx, actorUserId, input.body, now);
    const review = await insertReview(tx, {
      bookingId,
      mentorUserId: session.hostUserId,
      authorUserId: actorUserId,
      rating: input.rating,
      body: input.body,
      status: outcome.status,
      heldReason: outcome.heldReason,
      editWindowExpiresAt: new Date(now.getTime() + EDIT_WINDOW_HOURS * 3_600_000),
      publishedAt: outcome.status === "published" ? now : null,
    });
    if (outcome.status === "held") {
      await openContentCase(tx, "review", review.id, outcome.check);
    } else {
      await recomputeMentorStats(tx, session.hostUserId, now);
    }

    await writeAudit(tx, {
      actorType: "user",
      actorUserId,
      action: "trust.review_created",
      targetType: "review",
      targetId: review.id,
      metadata: { bookingId, status: outcome.status },
    });

    return review;
  });
}

export async function editReview(
  db: Database,
  actorUserId: string,
  reviewId: string,
  body: string,
  now: Date,
): Promise<ReviewRow> {
  return db.transaction(async (tx) => {
    const review = await findReview(tx, reviewId);
    if (!review) throw new AppError("NOT_FOUND");
    if (review.authorUserId !== actorUserId) throw new AppError("FORBIDDEN");
    if (now > review.editWindowExpiresAt) {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "The edit window has closed." });
    }

    const outcome = await runPublicationCheck(tx, actorUserId, body, now);
    await updateReviewBody(tx, reviewId, body, now);
    const updated = await setReviewStatus(tx, reviewId, outcome.status, now, outcome.heldReason);
    if (!updated) throw new AppError("NOT_FOUND");
    if (outcome.status === "held") {
      await openContentCase(tx, "review", reviewId, outcome.check);
    }
    if (outcome.status !== review.status) {
      await recomputeMentorStats(tx, review.mentorUserId, now);
    }
    return updated;
  });
}

export async function respondToReview(
  db: Database,
  mentorUserId: string,
  reviewId: string,
  body: string,
  now: Date,
): Promise<ReviewResponseRow> {
  return db.transaction(async (tx) => {
    const review = await findReview(tx, reviewId);
    if (!review) throw new AppError("NOT_FOUND");
    if (review.mentorUserId !== mentorUserId) throw new AppError("FORBIDDEN");
    const existing = await findReviewResponse(tx, reviewId);
    if (existing) {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This review already has a response.",
      });
    }

    const outcome = await runPublicationCheck(tx, mentorUserId, body, now);
    const response = await insertReviewResponse(tx, {
      reviewId,
      mentorUserId,
      body,
      status: outcome.status,
      heldReason: outcome.heldReason,
      publishedAt: outcome.status === "published" ? now : null,
    });
    if (outcome.status === "held") {
      await openContentCase(tx, "review_response", response.id, outcome.check);
    }
    return response;
  });
}

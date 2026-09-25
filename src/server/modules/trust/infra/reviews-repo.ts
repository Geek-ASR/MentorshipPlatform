import { and, avg, eq, gte } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { reviewResponses, reviews } from "./tables";
import type { ReviewStatus } from "../domain/types";

export type ReviewRow = typeof reviews.$inferSelect;
export type ReviewResponseRow = typeof reviewResponses.$inferSelect;

export async function insertReview(
  executor: Executor,
  input: {
    bookingId: string;
    mentorUserId: string;
    authorUserId: string;
    rating: number;
    body: string;
    status: ReviewStatus;
    heldReason: string | null;
    editWindowExpiresAt: Date;
    publishedAt: Date | null;
  },
): Promise<ReviewRow> {
  const [row] = await executor
    .insert(reviews)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function findReview(executor: Executor, id: string): Promise<ReviewRow | undefined> {
  const [row] = await executor.select().from(reviews).where(eq(reviews.id, id)).limit(1);
  return row;
}

export async function findReviewByBooking(
  executor: Executor,
  bookingId: string,
): Promise<ReviewRow | undefined> {
  const [row] = await executor
    .select()
    .from(reviews)
    .where(eq(reviews.bookingId, bookingId))
    .limit(1);
  return row;
}

export async function listPublishedReviewsForMentor(
  executor: Executor,
  mentorUserId: string,
): Promise<ReviewRow[]> {
  return executor
    .select()
    .from(reviews)
    .where(and(eq(reviews.mentorUserId, mentorUserId), eq(reviews.status, "published")));
}

export async function updateReviewBody(
  executor: Executor,
  id: string,
  body: string,
  now: Date,
): Promise<ReviewRow | undefined> {
  const [row] = await executor
    .update(reviews)
    .set({ body, updatedAt: now })
    .where(eq(reviews.id, id))
    .returning();
  return row;
}

export async function setReviewStatus(
  executor: Executor,
  id: string,
  status: ReviewStatus,
  now: Date,
  heldReason: string | null = null,
): Promise<ReviewRow | undefined> {
  const [row] = await executor
    .update(reviews)
    .set({
      status,
      heldReason,
      publishedAt: status === "published" ? now : undefined,
      updatedAt: now,
    })
    .where(eq(reviews.id, id))
    .returning();
  return row;
}

/** Fake-review signal input (docs/10 §10): recent reviews by the same author, for a crude duplicate-
 * text check against their own history (this phase's scoped-down version of the full
 * cross-account text-similarity system, which is Beta — see the Phase 10 retrospective). */
export async function listRecentReviewsByAuthor(
  executor: Executor,
  authorUserId: string,
  since: Date,
): Promise<ReviewRow[]> {
  return executor
    .select()
    .from(reviews)
    .where(and(eq(reviews.authorUserId, authorUserId), gte(reviews.createdAt, since)));
}

export async function insertReviewResponse(
  executor: Executor,
  input: {
    reviewId: string;
    mentorUserId: string;
    body: string;
    status: ReviewStatus;
    heldReason: string | null;
    publishedAt: Date | null;
  },
): Promise<ReviewResponseRow> {
  const [row] = await executor
    .insert(reviewResponses)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function findReviewResponse(
  executor: Executor,
  reviewId: string,
): Promise<ReviewResponseRow | undefined> {
  const [row] = await executor
    .select()
    .from(reviewResponses)
    .where(eq(reviewResponses.reviewId, reviewId))
    .limit(1);
  return row;
}

export async function findReviewResponseById(
  executor: Executor,
  id: string,
): Promise<ReviewResponseRow | undefined> {
  const [row] = await executor
    .select()
    .from(reviewResponses)
    .where(eq(reviewResponses.id, id))
    .limit(1);
  return row;
}

/** The Bayesian average's prior (docs/10 §10: "prior = platform mean, weight 5") — recomputed
 * nightly alongside mentor stats, not on every read. */
export async function computePlatformMeanRating(executor: Executor): Promise<number> {
  const [row] = await executor
    .select({ mean: avg(reviews.rating) })
    .from(reviews)
    .where(eq(reviews.status, "published"));
  return row?.mean ? Number(row.mean) : 4.5;
}

import type { Executor } from "@/server/platform/db/client";
import { findMentorProfile } from "@/server/modules/profiles";
import { expiresAt, pointsFor } from "../domain/catalog";
import type { TrustEventType } from "../domain/types";
import { insertTrustEvent } from "../infra/trust-events-repo";
import { runPolicyEngineForBothLadders, type PolicyEngineOutcome } from "./policy-engine";
import { recomputeMentorStats } from "./reliability";

export type RecordTrustEventInput = {
  subjectUserId: string;
  type: TrustEventType;
  /** What produced this event, for the idempotency unique index `[sourceType, sourceId, type]`. */
  sourceType: string;
  sourceId: string | null;
};

/**
 * The single call site for turning a fact into a real, points-and-decay-carrying `trust_events` row
 * and immediately re-evaluating both ladders (docs/10 §4.1 "each new event re-evaluates the rules")
 * — used by the audit-log ingestion poller for booking-sourced signals, and directly by call sites
 * that already know the fact synchronously (moderation deciding a report was valid, a detector
 * flagging solicitation in submitted text) rather than round-tripping through an audit-log signal.
 */
export async function recordTrustEvent(
  executor: Executor,
  input: RecordTrustEventInput,
  now: Date,
): Promise<PolicyEngineOutcome[]> {
  const row = await insertTrustEvent(executor, {
    subjectUserId: input.subjectUserId,
    type: input.type,
    points: pointsFor(input.type),
    occurredAt: now,
    expiresAt: expiresAt(input.type, now),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
  // `onConflictDoNothing` returned nothing: this exact source already produced this exact event
  // type, so there's nothing new to re-evaluate the ladders for.
  if (!row) return [];

  // A reliability-affecting event (docs/17 §11) changes the mentor's own stats immediately rather
  // than waiting for the nightly sweep — a no-op for a subject with no mentor profile (a student).
  const mentorProfile = await findMentorProfile(executor, input.subjectUserId);
  if (mentorProfile) {
    await recomputeMentorStats(executor, input.subjectUserId, now);
  }

  return runPolicyEngineForBothLadders(executor, input.subjectUserId, now);
}

import { z } from "zod";
import { defineJob, type RecurringJob } from "@/server/platform/outbox/outbox";
import { ingestPendingAuditSignals } from "./trust-event-ingestion";
import { sweepDisputeAppealDeadlines, sweepDisputeEvidenceDeadlines } from "./disputes";
import { recomputeAllMentorStats } from "./reliability";

export const ingestTrustSignals = defineJob({
  type: "trust.ingest_signals",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const summary = await ingestPendingAuditSignals(db, clock.now());
    if (summary.recorded > 0) {
      logger.info({ event: "trust.ingest_signals", ...summary }, "trust event ingestion tick");
    }
  },
});

export const sweepDisputeEvidence = defineJob({
  type: "trust.sweep_dispute_evidence",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const count = await sweepDisputeEvidenceDeadlines(db, clock.now());
    if (count > 0) {
      logger.info(
        { event: "trust.sweep_dispute_evidence", count },
        "moved disputes to under_review",
      );
    }
  },
});

export const sweepDisputeAppeals = defineJob({
  type: "trust.sweep_dispute_appeals",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const count = await sweepDisputeAppealDeadlines(db, clock.now());
    if (count > 0) {
      logger.info(
        { event: "trust.sweep_dispute_appeals", count },
        "closed disputes past appeal window",
      );
    }
  },
});

export const recomputeStats = defineJob({
  type: "trust.recompute_stats",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const count = await recomputeAllMentorStats(db, clock.now());
    logger.info({ event: "trust.recompute_stats", count }, "recomputed mentor stats");
  },
});

export const trustJobs = [
  ingestTrustSignals,
  sweepDisputeEvidence,
  sweepDisputeAppeals,
  recomputeStats,
];

export const trustRecurringJobs: RecurringJob<Record<string, never>>[] = [
  { definition: ingestTrustSignals, intervalSeconds: 60, payload: {} },
  { definition: sweepDisputeEvidence, intervalSeconds: 300, payload: {} },
  { definition: sweepDisputeAppeals, intervalSeconds: 3_600, payload: {} },
  { definition: recomputeStats, intervalSeconds: 86_400, payload: {} },
];

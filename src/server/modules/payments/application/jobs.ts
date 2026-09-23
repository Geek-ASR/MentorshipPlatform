import { z } from "zod";
import { defineJob, type RecurringJob } from "@/server/platform/outbox/outbox";
import { sweepExpiredPaymentIntents } from "./sweeper";
import { releaseEligibleTransfers } from "./transfers";
import { createFakeGateway } from "../infra/fake-gateway";
import { processPaymentWebhook } from "./webhooks";

export const sweepPaymentIntents = defineJob({
  type: "payments.sweep_intents",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const result = await sweepExpiredPaymentIntents(db, clock.now());
    if (result.captured > 0 || result.expired > 0) {
      logger.info({ event: "payments.sweep_intents", ...result }, "payment intent sweep");
    }
  },
});

export const releaseTransfers = defineJob({
  type: "payments.release_transfers",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const gateway = createFakeGateway(db);
    const released = await releaseEligibleTransfers(db, gateway, clock.now());
    if (released > 0)
      logger.info({ event: "payments.release_transfers", released }, "transfers released");
  },
});

export const paymentsJobs = [processPaymentWebhook, sweepPaymentIntents, releaseTransfers];

export const paymentsRecurringJobs: RecurringJob<Record<string, never>>[] = [
  { definition: sweepPaymentIntents, intervalSeconds: 120, payload: {} },
  { definition: releaseTransfers, intervalSeconds: 300, payload: {} },
];

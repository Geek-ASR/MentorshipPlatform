import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineJob, type RecurringJob } from "./outbox";

/** Deletes expired idempotency keys, stale rate-limit buckets and old completed jobs. */
export const purgeExpiredPlatformData = defineJob({
  type: "platform.purge_expired",
  schema: z.object({ completedJobRetentionDays: z.number().int().min(1).max(90) }),
  maxAttempts: 3,
  async handle(payload, { db, clock, logger }) {
    const now = clock.now();
    const idempotency = await db.execute(
      sql`DELETE FROM app.idempotency_keys WHERE expires_at <= ${now.toISOString()}::timestamptz`,
    );
    const buckets = await db.execute(
      sql`DELETE FROM app.rate_limit_buckets WHERE expires_at <= ${now.toISOString()}::timestamptz`,
    );
    const jobs = await db.execute(sql`
      DELETE FROM app.outbox_jobs
      WHERE status IN ('completed', 'cancelled')
        AND completed_at < ${now.toISOString()}::timestamptz - make_interval(days => ${payload.completedJobRetentionDays})
    `);
    logger.info(
      {
        event: "platform.purge_expired",
        idempotencyKeys: idempotency.count,
        rateLimitBuckets: buckets.count,
        outboxJobs: jobs.count,
      },
      "purged expired platform data",
    );
  },
});

export const platformJobs = [purgeExpiredPlatformData];

export const platformRecurringJobs: RecurringJob<{ completedJobRetentionDays: number }>[] = [
  {
    definition: purgeExpiredPlatformData,
    intervalSeconds: 3600,
    payload: { completedJobRetentionDays: 7 },
  },
];

import { desc, eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import type { z } from "zod";
import { systemClock, type Clock } from "../clock";
import type { Database, Executor } from "../db/client";
import { outboxJobs, type OutboxStatus } from "../db/tables/platform";
import { newId } from "../ids";
import { retryDelayMs, summarizeJobError } from "./backoff";

export type JobContext = {
  jobId: string;
  attempt: number;
  db: Database;
  clock: Clock;
  logger: Logger;
};

export type JobDefinition<TPayload> = {
  type: string;
  schema: z.ZodType<TPayload>;
  maxAttempts?: number;
  /** Handlers must be idempotent: delivery is at-least-once. */
  handle(payload: TPayload, context: JobContext): Promise<void>;
};

export function defineJob<TPayload>(definition: JobDefinition<TPayload>): JobDefinition<TPayload> {
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(definition.type)) {
    throw new Error(`Invalid job type "${definition.type}"`);
  }
  return definition;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry of payload types
export type AnyJobDefinition = JobDefinition<any>;

export type JobRegistry = ReadonlyMap<string, AnyJobDefinition>;

export function createJobRegistry(definitions: AnyJobDefinition[]): JobRegistry {
  const registry = new Map<string, AnyJobDefinition>();
  for (const definition of definitions) {
    if (registry.has(definition.type)) throw new Error(`Duplicate job type "${definition.type}"`);
    registry.set(definition.type, definition);
  }
  return registry;
}

export type EnqueueOptions = {
  runAt?: Date;
  /** Jobs with the same dedupe key are enqueued at most once. */
  dedupeKey?: string;
  causationId?: string;
};

/**
 * Enqueues a job inside the caller's transaction (transactional outbox). The payload is validated
 * before insert so malformed jobs fail at the source, not in the worker.
 */
export async function enqueueJob<TPayload>(
  executor: Executor,
  definition: JobDefinition<TPayload>,
  payload: TPayload,
  options: EnqueueOptions = {},
): Promise<{ id: string; enqueued: boolean }> {
  const parsed = definition.schema.parse(payload);
  const id = newId();
  const inserted = await executor
    .insert(outboxJobs)
    .values({
      id,
      type: definition.type,
      payload: parsed,
      runAt: options.runAt ?? new Date(),
      maxAttempts: definition.maxAttempts ?? 8,
      dedupeKey: options.dedupeKey ?? null,
      causationId: options.causationId ?? null,
    })
    .onConflictDoNothing({ target: outboxJobs.dedupeKey })
    .returning({ id: outboxJobs.id });
  return inserted[0] ? { id, enqueued: true } : { id, enqueued: false };
}

type ClaimedJobRow = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

export type WorkerOptions = {
  workerId: string;
  batchSize?: number;
  /** How long a claimed job stays locked; expired locks are reclaimed by other workers. */
  lockSeconds?: number;
  /** Stop claiming new batches after this many milliseconds. */
  budgetMs?: number;
  clock?: Clock;
  random?: () => number;
  logger: Logger;
};

export type WorkerResult = { claimed: number; completed: number; retried: number; failed: number };

async function claimJobs(
  db: Database,
  workerId: string,
  batchSize: number,
  lockSeconds: number,
  now: Date,
) {
  return db.execute<ClaimedJobRow>(sql`
    UPDATE app.outbox_jobs AS job
    SET status = 'processing',
        locked_by = ${workerId},
        locked_until = ${now.toISOString()}::timestamptz + make_interval(secs => ${lockSeconds}),
        attempts = job.attempts + 1
    WHERE job.id IN (
      SELECT id FROM app.outbox_jobs
      WHERE (status = 'pending' AND run_at <= ${now.toISOString()}::timestamptz)
         OR (status = 'processing' AND locked_until < ${now.toISOString()}::timestamptz)
      ORDER BY run_at
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING job.id, job.type, job.payload, job.attempts, job.max_attempts
  `);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Job timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Claims and runs due jobs until the batch is empty or the time budget is used. */
export async function processDueJobs(
  db: Database,
  registry: JobRegistry,
  options: WorkerOptions,
): Promise<WorkerResult> {
  const clock = options.clock ?? systemClock;
  const batchSize = options.batchSize ?? 25;
  const lockSeconds = options.lockSeconds ?? 60;
  const budgetMs = options.budgetMs ?? 20_000;
  const startedAt = Date.now();
  const result: WorkerResult = { claimed: 0, completed: 0, retried: 0, failed: 0 };

  while (Date.now() - startedAt < budgetMs) {
    const jobs = await claimJobs(db, options.workerId, batchSize, lockSeconds, clock.now());
    if (jobs.length === 0) break;
    result.claimed += jobs.length;

    for (const job of jobs) {
      const logger = options.logger.child({
        jobId: job.id,
        jobType: job.type,
        attempt: job.attempts,
      });
      try {
        const definition = registry.get(job.type);
        if (!definition) throw new Error(`No handler registered for job type "${job.type}"`);
        const payload = definition.schema.parse(job.payload);
        await withTimeout(
          definition.handle(payload, { jobId: job.id, attempt: job.attempts, db, clock, logger }),
          Math.max(1000, (lockSeconds - 5) * 1000),
        );
        await db.execute(sql`
          UPDATE app.outbox_jobs
          SET status = 'completed', completed_at = now(), locked_by = NULL, locked_until = NULL, last_error = NULL
          WHERE id = ${job.id} AND locked_by = ${options.workerId} AND status = 'processing'
        `);
        result.completed += 1;
        logger.info({ event: "job.completed" }, "job completed");
      } catch (error) {
        const exhausted = job.attempts >= job.max_attempts;
        const retryAt = new Date(
          clock.now().getTime() + retryDelayMs(job.attempts, options.random),
        );
        await db.execute(sql`
          UPDATE app.outbox_jobs
          SET status = ${exhausted ? "failed" : "pending"},
              run_at = ${retryAt.toISOString()}::timestamptz,
              last_error = ${summarizeJobError(error)},
              locked_by = NULL, locked_until = NULL
          WHERE id = ${job.id} AND locked_by = ${options.workerId} AND status = 'processing'
        `);
        if (exhausted) {
          result.failed += 1;
          logger.error(
            { event: "job.failed", err: summarizeJobError(error) },
            "job failed permanently",
          );
        } else {
          result.retried += 1;
          logger.warn(
            { event: "job.retry_scheduled", err: summarizeJobError(error) },
            "job will retry",
          );
        }
      }
    }
  }
  return result;
}

export type RecurringJob<TPayload> = {
  definition: JobDefinition<TPayload>;
  intervalSeconds: number;
  payload: TPayload;
};

/**
 * Idempotently enqueues one occurrence of each recurring job per interval slot. Safe to call on
 * every tick from any number of workers: the dedupe key makes duplicates no-ops.
 */
export async function scheduleRecurringJobs(
  executor: Executor,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous payload types
  recurring: ReadonlyArray<RecurringJob<any>>,
  now: Date,
): Promise<number> {
  let enqueued = 0;
  for (const job of recurring) {
    const intervalMs = job.intervalSeconds * 1000;
    const slotStart = Math.floor(now.getTime() / intervalMs) * intervalMs;
    const result = await enqueueJob(executor, job.definition, job.payload, {
      runAt: new Date(slotStart),
      dedupeKey: `recurring:${job.definition.type}:${slotStart}`,
    });
    if (result.enqueued) enqueued += 1;
  }
  return enqueued;
}

export type OutboxJobRow = typeof outboxJobs.$inferSelect;

/** docs/19 Phase 11 "outbox & jobs inspector". */
export async function listOutboxJobsForAdmin(
  executor: Executor,
  options: { status?: OutboxStatus; limit?: number } = {},
): Promise<OutboxJobRow[]> {
  const limit = options.limit ?? 50;
  const query = executor.select().from(outboxJobs);
  const rows = options.status
    ? await query
        .where(eq(outboxJobs.status, options.status))
        .orderBy(desc(outboxJobs.createdAt))
        .limit(limit)
    : await query.orderBy(desc(outboxJobs.createdAt)).limit(limit);
  return rows;
}

/** Resets a job to run again from a clean slate — used for a `failed` (attempts exhausted) job an
 * admin has decided is now safe to retry (e.g. after fixing whatever made every attempt fail). */
export async function retryOutboxJob(executor: Executor, id: string, now: Date): Promise<void> {
  await executor
    .update(outboxJobs)
    .set({
      status: "pending",
      attempts: 0,
      runAt: now,
      lastError: null,
      lockedBy: null,
      lockedUntil: null,
    })
    .where(eq(outboxJobs.id, id));
}

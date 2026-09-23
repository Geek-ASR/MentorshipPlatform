import { hostname } from "node:os";
import type { Logger } from "pino";
import type { Clock } from "./platform/clock";
import type { Database } from "./platform/db/client";
import {
  createJobRegistry,
  processDueJobs,
  scheduleRecurringJobs,
  type WorkerResult,
} from "./platform/outbox/outbox";
import { platformJobs, platformRecurringJobs } from "./platform/outbox/platform-jobs";
import { authJobs } from "./modules/auth";
import { bookingJobs, bookingRecurringJobs } from "./modules/booking";

/** Every job type in the system. Modules append their definitions here as they are built. */
export const jobRegistry = createJobRegistry([...platformJobs, ...authJobs, ...bookingJobs]);

export const recurringJobs = [...platformRecurringJobs, ...bookingRecurringJobs];

export type TickResult = WorkerResult & { recurringEnqueued: number };

/** One scheduler tick: ensure recurring jobs exist for the current slot, then drain due jobs. */
export async function runJobTick(
  db: Database,
  options: { clock: Clock; logger: Logger; budgetMs?: number },
): Promise<TickResult> {
  const recurringEnqueued = await scheduleRecurringJobs(db, recurringJobs, options.clock.now());
  const result = await processDueJobs(db, jobRegistry, {
    workerId: `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`,
    clock: options.clock,
    logger: options.logger,
    budgetMs: options.budgetMs ?? 20_000,
  });
  return { ...result, recurringEnqueued };
}

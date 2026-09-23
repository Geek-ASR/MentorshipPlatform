import { z } from "zod";
import { defineJob, type RecurringJob } from "@/server/platform/outbox/outbox";
import { runAttendanceFinalizer } from "./attendance";
import { expirePendingReschedules } from "./reschedule";
import { bookingNotificationJobs } from "./notifications";

export const finalizeAttendance = defineJob({
  type: "booking.finalize_attendance",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const summary = await runAttendanceFinalizer(db, clock.now());
    logger.info({ event: "booking.finalize_attendance", ...summary }, "attendance finaliser tick");
  },
});

export const expireReschedules = defineJob({
  type: "booking.expire_reschedules",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const count = await expirePendingReschedules(db, clock.now());
    if (count > 0)
      logger.info({ event: "booking.expire_reschedules", count }, "expired reschedules");
  },
});

export const bookingJobs = [finalizeAttendance, expireReschedules, ...bookingNotificationJobs];

export const bookingRecurringJobs: RecurringJob<Record<string, never>>[] = [
  { definition: finalizeAttendance, intervalSeconds: 300, payload: {} },
  { definition: expireReschedules, intervalSeconds: 300, payload: {} },
];

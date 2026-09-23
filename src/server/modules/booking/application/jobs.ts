import { z } from "zod";
import { getEnv } from "@/config/env";
import { defineJob, type RecurringJob } from "@/server/platform/outbox/outbox";
import { runAttendanceFinalizer } from "./attendance";
import { expirePendingReschedules } from "./reschedule";
import { syncPaidBookingsOnce } from "./paid-sync";
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

/**
 * Notices a `held`/`expired`/`cancelled_by_student` booking whose payment has actually succeeded
 * and confirms it — the booking-side half of docs/08 §10's payment sweeper. `payments`' webhook and
 * intent sweeper only update payment-side state; they never call into `booking` directly (a real
 * circular module dependency, docs/19 Phase 8), so this poll is what actually confirms the booking.
 */
export const syncPaidBookings = defineJob({
  type: "booking.sync_paid_bookings",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock, logger }) {
    const summary = await syncPaidBookingsOnce(db, clock.now(), getEnv().APP_BASE_URL);
    if (summary.confirmed > 0 || summary.orphaned > 0) {
      logger.info({ event: "booking.sync_paid_bookings", ...summary }, "paid booking sync tick");
    }
  },
});

export const bookingJobs = [
  finalizeAttendance,
  expireReschedules,
  syncPaidBookings,
  ...bookingNotificationJobs,
];

export const bookingRecurringJobs: RecurringJob<Record<string, never>>[] = [
  { definition: finalizeAttendance, intervalSeconds: 300, payload: {} },
  { definition: expireReschedules, intervalSeconds: 300, payload: {} },
  { definition: syncPaidBookings, intervalSeconds: 60, payload: {} },
];

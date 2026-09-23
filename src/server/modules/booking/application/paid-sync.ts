import type { Database } from "@/server/platform/db/client";
import {
  createFakeGateway,
  getPaymentStatusForBooking,
  refundOrderItem,
} from "@/server/modules/payments";
import { confirmPaidBooking } from "./paid-confirmation";
import { listBookingsPendingPaymentSync } from "../infra/booking-repo";

export type SyncPaidBookingsSummary = { confirmed: number; orphaned: number };

/**
 * Notices a `held`/`expired`/`cancelled_by_student` booking whose payment has actually succeeded
 * and confirms it — the booking-side half of docs/08 §10's payment sweeper. `payments`' webhook and
 * intent sweeper only update payment-side state; they never call into `booking` directly (a real
 * circular module dependency, docs/19 Phase 8), so this poll is what actually confirms the booking.
 * Exported standalone (not just inline in the job) so tests can call it deterministically without
 * going through the outbox, matching `runAttendanceFinalizer`/`expirePendingReschedules`.
 */
export async function syncPaidBookingsOnce(
  db: Database,
  now: Date,
  appBaseUrl: string,
): Promise<SyncPaidBookingsSummary> {
  const candidates = await listBookingsPendingPaymentSync(db);
  let confirmed = 0;
  let orphaned = 0;

  for (const booking of candidates) {
    if (!booking.orderItemId) continue;
    const paymentStatus = await getPaymentStatusForBooking(db, booking.orderItemId);
    if (paymentStatus?.status !== "succeeded") continue;

    const outcome = await confirmPaidBooking(db, booking.id, now, appBaseUrl);
    if (outcome.outcome === "confirmed") {
      confirmed += 1;
    } else if (outcome.outcome === "orphaned") {
      const gateway = createFakeGateway(db);
      // refundOrderItem posts a multi-line ledger journal whose balance check is deferred to
      // commit — it must run inside an explicit transaction (payments/infra/ledger-repo.ts).
      await db.transaction((tx) =>
        refundOrderItem(
          tx,
          gateway,
          {
            orderItemId: booking.orderItemId!,
            refundMinor: outcome.refundMinor,
            reasonCode: "slot_lost",
            initiatedBy: "system",
            idempotencyKey: `orphan-refund:${booking.id}`,
          },
          now,
        ),
      );
      orphaned += 1;
    }
  }
  return { confirmed, orphaned };
}

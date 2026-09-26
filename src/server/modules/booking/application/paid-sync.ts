import type { Database } from "@/server/platform/db/client";
import type { UserActor } from "@/server/platform/authz/actor";
import { AppError } from "@/server/platform/errors";
import {
  createFakeGateway,
  getPaymentStatusForBooking,
  refreshPaymentForOrderItem,
  refundOrderItem,
} from "@/server/modules/payments";
import { confirmPaidBooking } from "./paid-confirmation";
import {
  findBooking,
  listBookingsPendingPaymentSync,
  type BookingRow,
} from "../infra/booking-repo";

export type SyncPaidBookingsSummary = { confirmed: number; orphaned: number };

const SETTLEABLE: BookingRow["status"][] = [
  "held",
  "expired",
  "cancelled_by_student",
  "cancelled_system",
];

/**
 * One booking's side of a succeeded payment: confirm it, or — if its slot is gone — orphan it and
 * refund in full. Shared by the scheduled sweep and the client-initiated sync so both follow
 * exactly one path.
 */
async function settlePaidBooking(
  db: Database,
  booking: BookingRow,
  now: Date,
  appBaseUrl: string,
): Promise<"confirmed" | "orphaned" | "unchanged"> {
  if (!booking.orderItemId) return "unchanged";
  const paymentStatus = await getPaymentStatusForBooking(db, booking.orderItemId);
  if (paymentStatus?.status !== "succeeded") return "unchanged";

  const outcome = await confirmPaidBooking(db, booking.id, now, appBaseUrl);
  if (outcome.outcome === "confirmed") return "confirmed";
  if (outcome.outcome !== "orphaned") return "unchanged";

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
  return "orphaned";
}

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
    const outcome = await settlePaidBooking(db, booking, now, appBaseUrl);
    if (outcome === "confirmed") confirmed += 1;
    if (outcome === "orphaned") orphaned += 1;
  }
  return { confirmed, orphaned };
}

/**
 * "I've paid — check now" for one booking (docs/08 §6 rule 5, docs/22 §3 J1 "Confirming your
 * payment…"): re-reads the provider's record for this booking's payment and settles the booking
 * straight away, instead of leaving the student waiting for the next scheduler tick. Only the
 * booking's own student may ask; anyone else gets a 404.
 */
export async function syncPaidBooking(
  db: Database,
  actor: UserActor,
  bookingId: string,
  now: Date,
  appBaseUrl: string,
): Promise<BookingRow> {
  const booking = await findBooking(db, bookingId);
  if (!booking || booking.studentId !== actor.userId) throw new AppError("NOT_FOUND");
  if (
    !booking.orderItemId ||
    booking.confirmedAt !== null ||
    !SETTLEABLE.includes(booking.status)
  ) {
    return booking;
  }
  await refreshPaymentForOrderItem(db, booking.orderItemId, now);
  await settlePaidBooking(db, booking, now, appBaseUrl);
  return (await findBooking(db, bookingId)) ?? booking;
}

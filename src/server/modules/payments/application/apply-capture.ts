import type { Database } from "@/server/platform/db/client";
import { captureJournal } from "../domain/ledger";
import {
  canTransitionIntent,
  resolvePaymentTransition,
  transitionIntent,
} from "../domain/state-machines";
import type { PaymentGateway } from "./ports";
import { findOrderItemByOrder } from "../infra/orders-repo";
import { transitionPaymentIntent, type PaymentIntentRow } from "../infra/payment-intents-repo";
import {
  findPaymentByProviderPaymentId,
  insertPayment,
  setPaymentStatus,
} from "../infra/payments-repo";
import { postJournal } from "../infra/ledger-repo";
import { createTransferForOrderItem } from "./transfers";

export type VerifiedCaptureEntity = {
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
};

/**
 * Applies an *already-verified* capture (the caller re-fetched the provider's authoritative state
 * first — docs/08 §6 rule 4/5) — shared by the webhook handler and the payment sweeper so a missed
 * or delayed webhook and a sweep-discovered capture behave identically (docs/08 §10, §11).
 */
export async function applyVerifiedCapture(
  db: Database,
  gateway: PaymentGateway,
  intent: PaymentIntentRow,
  entity: VerifiedCaptureEntity,
  now: Date,
): Promise<void> {
  const orderItem = await findOrderItemByOrder(db, intent.orderId);
  if (!orderItem) return;

  await db.transaction(async (tx) => {
    let payment = await findPaymentByProviderPaymentId(
      tx,
      intent.provider,
      entity.providerPaymentId,
    );
    if (!payment) {
      payment = await insertPayment(tx, {
        paymentIntentId: intent.id,
        provider: intent.provider,
        providerPaymentId: entity.providerPaymentId,
        status: "captured",
        amountMinor: entity.amountMinor,
        currency: entity.currency,
        method: null,
      });
    } else {
      const resolution = resolvePaymentTransition(payment.status, "captured");
      if (resolution.kind === "apply") await setPaymentStatus(tx, payment.id, resolution.to, now);
    }

    if (canTransitionIntent(intent.status, "capture_verified")) {
      await transitionPaymentIntent(
        tx,
        intent.id,
        intent.version,
        transitionIntent(intent.status, "capture_verified"),
        now,
      );
    } else if (canTransitionIntent(intent.status, "late_capture_verified")) {
      await transitionPaymentIntent(
        tx,
        intent.id,
        intent.version,
        transitionIntent(intent.status, "late_capture_verified"),
        now,
      );
    }

    await postJournal(
      tx,
      captureJournal({
        idempotencyKey: `capture:${payment.id}`,
        mentorUserId: orderItem.mentorUserId,
        currency: orderItem.currency,
        amountMinor: orderItem.unitAmountMinor,
        commissionMinor: orderItem.commissionMinor,
        mentorShareMinor: orderItem.mentorShareMinor,
      }),
    );
  });

  await createTransferForOrderItem(db, gateway, orderItem.id, orderItem.mentorUserId, now);
}

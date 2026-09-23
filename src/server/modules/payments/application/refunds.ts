import type { Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import type { PaymentGateway } from "./ports";
import {
  goodwillRefundJournal,
  refundAfterReleaseJournal,
  refundBeforeReleaseJournal,
} from "../domain/ledger";
import { recomputeAfterRefund, type SnapshottedCommission } from "../domain/refund-math";
import { canTransitionTransfer, transitionTransfer } from "../domain/state-machines";
import { findOrderItem, findOrderItemByOrder } from "../infra/orders-repo";
import { findPayoutAccountById } from "../infra/payout-accounts-repo";
import { addRefundedAmount, findPayment, listPaymentsForIntent } from "../infra/payments-repo";
import { findPaymentIntent, findPaymentIntentByOrder } from "../infra/payment-intents-repo";
import {
  findRefundByIdempotencyKey,
  insertRefund,
  updateRefundStatus,
  type RefundRow,
} from "../infra/refunds-repo";
import {
  insertTransferReversal,
  setTransferStatus,
  findTransferByOrderItem,
} from "../infra/transfers-repo";
import { postJournal } from "../infra/ledger-repo";
import type { RefundInitiator } from "../domain/types";

export type RefundOrderItemInput = {
  orderItemId: string;
  refundMinor: number;
  reasonCode: string;
  initiatedBy: RefundInitiator;
  /** Same reasonCode + orderItemId in a retry replays the same refund instead of double-charging. */
  idempotencyKey: string;
};

export type RefundOutcome = { refund: RefundRow; refundMinor: number };

/**
 * Refunds against the order item's captured payment, recomputing commission on what's retained
 * (docs/08 §8) and reversing the mentor's transfer wherever it currently sits (docs/08 §9) — before
 * release: one reversing journal; after release: a reversal attempt, then the refund journal, using
 * a mentor receivable if the reversal didn't recover the funds (the only branch Fake can never
 * exercise, since it never fails a reversal — docs/19 Phase 8 deviations).
 *
 * Takes an `Executor`, not `Database`, and never opens its own transaction: `booking`'s cancellation
 * flow calls this from inside its own already-open transaction so the status change and the refund
 * commit atomically together. A standalone caller (the admin refund route, the orphan-booking sync
 * job) can still pass the plain `Database` — it satisfies `Executor` — for its own atomicity.
 */
export async function refundOrderItem(
  executor: Executor,
  gateway: PaymentGateway,
  input: RefundOrderItemInput,
  now: Date,
): Promise<RefundOutcome> {
  const existing = await findRefundByIdempotencyKey(executor, input.idempotencyKey);
  if (existing) return { refund: existing, refundMinor: existing.amountMinor };

  if (input.refundMinor <= 0) {
    throw new Error(`refundMinor must be positive, got ${input.refundMinor}`);
  }

  const orderItem = await findOrderItem(executor, input.orderItemId);
  if (!orderItem) throw new Error(`order_item ${input.orderItemId} not found`);
  const intent = await findPaymentIntentByOrder(executor, orderItem.orderId);
  const payment = intent
    ? (await listPaymentsForIntent(executor, intent.id)).find(
        (p) => p.status === "captured" || p.status === "partially_refunded",
      )
    : undefined;
  if (!intent || !payment)
    throw new Error(`no captured payment found for order_item ${input.orderItemId}`);

  const providerRefund = await gateway.createRefund({
    providerPaymentId: payment.providerPaymentId,
    amountMinor: input.refundMinor,
    idempotencyKey: input.idempotencyKey,
  });
  const refund = await insertRefund(executor, {
    paymentId: payment.id,
    amountMinor: input.refundMinor,
    currency: orderItem.currency,
    reasonCode: input.reasonCode,
    idempotencyKey: input.idempotencyKey,
    provider: gateway.provider,
    initiatedBy: input.initiatedBy,
  });
  await updateRefundStatus(executor, refund.id, "processed", providerRefund.providerRefundId, now);
  const newRefundedTotal = payment.refundedMinor + input.refundMinor;
  await addRefundedAmount(
    executor,
    payment.id,
    input.refundMinor,
    newRefundedTotal >= payment.amountMinor ? "refunded" : "partially_refunded",
    now,
  );

  const commission: SnapshottedCommission = {
    percentBps: orderItem.percentBps,
    fixedMinor: 0,
    minFeeMinor: null,
    maxFeeMinor: null,
  };
  const recompute = recomputeAfterRefund({
    originalBaseMinor: orderItem.unitAmountMinor,
    originalCommissionMinor: orderItem.commissionMinor,
    originalMentorShareMinor: orderItem.mentorShareMinor,
    refundMinor: input.refundMinor,
    commission,
  });

  const transfer = await findTransferByOrderItem(executor, orderItem.id);
  const payoutAccount = transfer
    ? await findPayoutAccountById(executor, transfer.payoutAccountId)
    : undefined;

  if (!transfer || !payoutAccount) {
    // No transfer exists yet (payment captured but transfer creation hasn't run) — treat like a
    // platform-side reversal: nothing to claw back from the mentor.
    await postJournal(
      executor,
      goodwillRefundJournal({
        idempotencyKey: `refund-journal:${refund.id}`,
        currency: orderItem.currency,
        refundMinor: input.refundMinor,
      }),
    );
    return { refund, refundMinor: input.refundMinor };
  }

  if (transfer.status === "on_hold" || transfer.status === "pending") {
    const event =
      recompute.mentorReversalMinor >= transfer.amountMinor
        ? "full_refund_before_release"
        : "partial_refund_before_release";
    if (canTransitionTransfer(transfer.status, event)) {
      const to = transitionTransfer(transfer.status, event);
      await setTransferStatus(executor, transfer.id, to, now);
      if (recompute.mentorReversalMinor > 0) {
        await insertTransferReversal(executor, {
          transferId: transfer.id,
          amountMinor: recompute.mentorReversalMinor,
          reason: input.reasonCode,
        });
      }
    }
    await postJournal(
      executor,
      refundBeforeReleaseJournal({
        idempotencyKey: `refund-journal:${refund.id}`,
        mentorUserId: payoutAccount.mentorUserId,
        currency: orderItem.currency,
        refundMinor: input.refundMinor,
        mentorReversalMinor: recompute.mentorReversalMinor,
        commissionReversalMinor: recompute.commissionReversalMinor,
      }),
    );
    return { refund, refundMinor: input.refundMinor };
  }

  // Released or settled: attempt to reverse the transfer, then refund the student either way.
  let reversalRecovered = false;
  if (recompute.mentorReversalMinor > 0 && transfer.providerTransferId) {
    try {
      await gateway.reverseTransfer(transfer.providerTransferId, recompute.mentorReversalMinor);
      reversalRecovered = true;
    } catch {
      reversalRecovered = false;
    }
  }
  if (canTransitionTransfer(transfer.status, "reverse")) {
    await setTransferStatus(
      executor,
      transfer.id,
      transitionTransfer(transfer.status, "reverse"),
      now,
    );
  }
  if (recompute.mentorReversalMinor > 0) {
    await insertTransferReversal(executor, {
      transferId: transfer.id,
      amountMinor: recompute.mentorReversalMinor,
      reason: input.reasonCode,
    });
  }
  await postJournal(
    executor,
    refundAfterReleaseJournal({
      idempotencyKey: `refund-journal:${refund.id}`,
      mentorUserId: payoutAccount.mentorUserId,
      currency: orderItem.currency,
      refundMinor: input.refundMinor,
      mentorReversalMinor: recompute.mentorReversalMinor,
      commissionReversalMinor: recompute.commissionReversalMinor,
      reversalRecovered,
    }),
  );
  return { refund, refundMinor: input.refundMinor };
}

/**
 * Admin-initiated refund by payment id (docs/06 §7.9 `POST /admin/payments/{id}/refunds`). The
 * two-approver escalation above `refund.goodwill_max_minor` (docs/17 §5) is not implemented — it
 * needs its own approval-request workflow, deferred alongside invoices/chargebacks (docs/19 Phase 8
 * deviations); every admin refund here is audited with the acting admin's id either way.
 */
export async function adminRefundPayment(
  executor: Executor,
  gateway: PaymentGateway,
  actorUserId: string,
  paymentId: string,
  refundMinor: number,
  reasonCode: string,
  now: Date,
): Promise<RefundOutcome> {
  const payment = await findPayment(executor, paymentId);
  if (!payment) throw new AppError("NOT_FOUND");
  const intent = await findPaymentIntent(executor, payment.paymentIntentId);
  if (!intent) throw new AppError("NOT_FOUND");
  const orderItem = await findOrderItemByOrder(executor, intent.orderId);
  if (!orderItem) throw new AppError("NOT_FOUND");

  const outcome = await refundOrderItem(
    executor,
    gateway,
    {
      orderItemId: orderItem.id,
      refundMinor,
      reasonCode,
      initiatedBy: "staff",
      idempotencyKey: `admin-refund:${paymentId}:${reasonCode}:${refundMinor}`,
    },
    now,
  );
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "payment.admin_refund",
    targetType: "payment",
    targetId: paymentId,
    metadata: { refundMinor, reasonCode },
  });
  return outcome;
}

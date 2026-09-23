import type { Executor } from "@/server/platform/db/client";
import type { PaymentGateway } from "./ports";
import { quoteBooking } from "./commission-quote";
import {
  findOrderItem,
  insertOrder,
  insertOrderItem,
  type OrderItemRow,
  type OrderRow,
} from "../infra/orders-repo";
import {
  findPaymentIntentByOrder,
  insertPaymentIntent,
  type PaymentIntentRow,
} from "../infra/payment-intents-repo";
import { findPayoutAccount } from "../infra/payout-accounts-repo";
import type { PaymentIntentStatus } from "../domain/types";

export type CreateCheckoutInput = {
  studentId: string;
  bookingId: string;
  mentorUserId: string;
  serviceKind: string;
  categoryId: string | null;
  baseMinor: number;
  currency: string;
  holdTtlMin: number;
  now: Date;
};

export type CheckoutResult = {
  order: OrderRow;
  orderItem: OrderItemRow;
  paymentIntent: PaymentIntentRow;
  checkout: { provider: string; providerOrderId: string; amountMinor: number; currency: string };
};

/**
 * Creates the order/order_item/payment_intent trio inside the caller's transaction (docs/09 §6.1
 * step 4 — this runs as part of booking's own transaction, not a separate one, so a provider order
 * creation failure rolls the whole booking attempt back cleanly rather than leaving an orphan row).
 */
export async function createCheckout(
  executor: Executor,
  gateway: PaymentGateway,
  input: CreateCheckoutInput,
): Promise<CheckoutResult> {
  const quote = await quoteBooking(executor, {
    baseMinor: input.baseMinor,
    currency: input.currency,
    serviceKind: input.serviceKind,
    categoryId: input.categoryId,
    mentorUserId: input.mentorUserId,
    promoCode: null,
    now: input.now,
  });

  const order = await insertOrder(executor, {
    studentId: input.studentId,
    totalMinor: quote.totalStudentPaysMinor,
    currency: input.currency,
  });
  const orderItem = await insertOrderItem(executor, {
    orderId: order.id,
    bookingId: input.bookingId,
    mentorUserId: input.mentorUserId,
    unitAmountMinor: input.baseMinor,
    commissionRuleId: quote.commissionRuleId,
    percentBps: quote.percentBps,
    commissionMinor: quote.commissionMinor,
    mentorShareMinor: quote.mentorShareMinor,
    studentFeeMinor: quote.studentFeeMinor,
    feeBearer: quote.feeBearer,
    currency: input.currency,
  });

  const providerOrder = await gateway.createOrder({
    amountMinor: quote.totalStudentPaysMinor,
    currency: input.currency,
    receipt: order.id,
  });
  const paymentIntent = await insertPaymentIntent(executor, {
    orderId: order.id,
    provider: gateway.provider,
    providerOrderId: providerOrder.providerOrderId,
    amountMinor: quote.totalStudentPaysMinor,
    currency: input.currency,
    holdExpiresAt: new Date(input.now.getTime() + input.holdTtlMin * 60_000),
  });

  return {
    order,
    orderItem,
    paymentIntent,
    checkout: {
      provider: gateway.provider,
      providerOrderId: providerOrder.providerOrderId,
      amountMinor: quote.totalStudentPaysMinor,
      currency: input.currency,
    },
  };
}

/** The `mentorHasActivePayoutAccount` fact `evaluateBookingEligibility` needs (docs/09 §5). */
export async function hasActivePayoutAccount(
  executor: Executor,
  mentorUserId: string,
): Promise<boolean> {
  const account = await findPayoutAccount(executor, mentorUserId);
  return account?.status === "active";
}

export type OrderItemPaymentStatus = { orderItemId: string; status: PaymentIntentStatus } | null;

/** What `booking`'s own paid-booking sync job polls (docs/08 §10 payment sweeper) instead of payments
 * calling into booking directly — see the note atop `application/webhooks.ts`. */
export async function getPaymentStatusForBooking(
  executor: Executor,
  orderItemId: string,
): Promise<OrderItemPaymentStatus> {
  const orderItem = await findOrderItem(executor, orderItemId);
  if (!orderItem) return null;
  const intent = await findPaymentIntentByOrder(executor, orderItem.orderId);
  if (!intent) return null;
  return { orderItemId, status: intent.status };
}

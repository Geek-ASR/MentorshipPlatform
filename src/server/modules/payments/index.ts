/**
 * Public surface of the payments module (docs/05 §3.4, docs/08, docs/19 Phase 8). Other modules and
 * route handlers depend only on this file — never on `application/*`, `domain/*` or `infra/*`.
 */

export type { PaymentGateway } from "./application/ports";
export {
  createFakeGateway,
  verifyFakeWebhookSignature,
  signFakeWebhookPayload,
  simulateFakeCheckout,
} from "./infra/fake-gateway";
export {
  createCheckout,
  hasActivePayoutAccount,
  getPaymentStatusForBooking,
  type CreateCheckoutInput,
  type CheckoutResult,
  type OrderItemPaymentStatus,
} from "./application/checkout";
export { quoteBooking, type QuoteBookingInput } from "./application/commission-quote";
export {
  createTransferForOrderItem,
  releaseEligibleTransfers,
  adminHoldTransfer,
  adminReleaseTransfer,
} from "./application/transfers";
export {
  refundOrderItem,
  adminRefundPayment,
  type RefundOrderItemInput,
  type RefundOutcome,
} from "./application/refunds";
export {
  receiveWebhook,
  processPaymentWebhook,
  replayWebhookEvent,
  type ReceiveWebhookResult,
} from "./application/webhooks";
export {
  listWebhookEvents,
  findWebhookEvent,
  type WebhookEventRow,
} from "./infra/webhook-events-repo";
export { sweepExpiredPaymentIntents } from "./application/sweeper";
export { paymentsJobs, paymentsRecurringJobs } from "./application/jobs";
export {
  createCommissionRule,
  deactivateCommissionRule,
  listCommissionRulesForAdmin,
} from "./application/commission-admin";
export { onboardMentorPayoutAccount } from "./application/payout-accounts";
export {
  PAYMENT_INTENT_STATUSES,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  TRANSFER_STATUSES,
  PAYOUT_ACCOUNT_STATUSES,
  COMMISSION_SCOPE_TYPES,
  FEE_BEARERS,
  type PaymentIntentStatus,
  type PaymentStatus,
  type RefundStatus,
  type TransferStatus,
  type PayoutAccountStatus,
  type CommissionScopeType,
  type FeeBearer,
  type Provider,
} from "./domain/types";
export {
  findOrder,
  findOrderItem,
  findOrderItemByBooking,
  type OrderRow,
  type OrderItemRow,
} from "./infra/orders-repo";
export {
  findPaymentIntent,
  findPaymentIntentByOrder,
  type PaymentIntentRow,
} from "./infra/payment-intents-repo";
export {
  findPayment,
  listPaymentsForAdmin,
  listPaymentsForIntent,
  listPaymentsForStudent,
  type PaymentRow,
} from "./infra/payments-repo";
export {
  findRefund,
  listRefundsForPayment,
  listRefundsForStudent,
  type RefundRow,
} from "./infra/refunds-repo";
export { findPayoutAccount, type PayoutAccountRow } from "./infra/payout-accounts-repo";
export {
  findTransfer,
  findTransferByOrderItem,
  listTransfersForAdmin,
  listTransfersForMentor,
  type TransferRow,
} from "./infra/transfers-repo";

/** Shared enums for the payments module (docs/05 §3.4, docs/08 §5). */

export const PAYMENT_INTENT_STATUSES = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "expired",
  "cancelled",
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "created",
  "authorized",
  "captured",
  "partially_refunded",
  "refunded",
  "failed",
  "disputed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = ["requested", "pending", "processed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const TRANSFER_STATUSES = [
  "pending",
  "on_hold",
  "released",
  "cancelled",
  "reversed",
  "partially_reversed",
  "settled",
  "failed",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const PAYOUT_ACCOUNT_STATUSES = ["pending", "active", "rejected", "deactivated"] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

export const WEBHOOK_EVENT_STATUSES = ["received", "processed", "ignored", "failed"] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const PROVIDERS = ["fake", "razorpay"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const FEE_BEARERS = ["mentor", "student", "split"] as const;
export type FeeBearer = (typeof FEE_BEARERS)[number];

export const COMMISSION_SCOPE_TYPES = [
  "global",
  "service_kind",
  "category",
  "promotion",
  "mentor",
] as const;
export type CommissionScopeType = (typeof COMMISSION_SCOPE_TYPES)[number];

export const REFUND_INITIATORS = ["system", "student", "mentor", "staff"] as const;
export type RefundInitiator = (typeof REFUND_INITIATORS)[number];

export const LEDGER_ACCOUNT_KINDS = [
  "psp_clearing",
  "mentor_payable",
  "commission_revenue",
  "psp_fees",
  "refund_costs",
  "chargeback_losses",
  "mentor_receivable",
] as const;
export type LedgerAccountKind = (typeof LEDGER_ACCOUNT_KINDS)[number];

export const LEDGER_DIRECTIONS = ["debit", "credit"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

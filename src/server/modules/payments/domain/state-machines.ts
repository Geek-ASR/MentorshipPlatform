import type { PaymentIntentStatus, PaymentStatus, RefundStatus, TransferStatus } from "./types";

/**
 * Payment-side state machines (docs/08 §5). Each is an explicit transition table like
 * `booking/domain/state-machine.ts` — legality only, no side effects. Unlike booking, `payment`'s
 * transitions aren't a simple DAG (a dispute can move status *backwards* in rank), so this file
 * also exposes a rank so the webhook handler can recognise and drop a stale, already-superseded
 * event instead of erroring on it (docs/08 §6 point 4: "don't trust event order").
 */

export type PaymentIntentEvent =
  | "provider_order_created"
  | "provider_order_failed"
  | "capture_verified"
  | "hold_expired_no_capture"
  | "abandoned"
  | "late_capture_verified";

type IntentRule = { from: PaymentIntentStatus; event: PaymentIntentEvent; to: PaymentIntentStatus };

const INTENT_TRANSITIONS: readonly IntentRule[] = [
  { from: "created", event: "provider_order_created", to: "pending" },
  { from: "created", event: "provider_order_failed", to: "failed" },
  { from: "pending", event: "capture_verified", to: "succeeded" },
  { from: "pending", event: "hold_expired_no_capture", to: "expired" },
  { from: "pending", event: "abandoned", to: "cancelled" },
  { from: "expired", event: "late_capture_verified", to: "succeeded" },
  { from: "cancelled", event: "late_capture_verified", to: "succeeded" },
];

export function transitionIntent(
  from: PaymentIntentStatus,
  event: PaymentIntentEvent,
): PaymentIntentStatus {
  const rule = INTENT_TRANSITIONS.find((r) => r.from === from && r.event === event);
  if (!rule) throw new Error(`No payment_intent transition for event "${event}" from "${from}"`);
  return rule.to;
}

export function canTransitionIntent(from: PaymentIntentStatus, event: PaymentIntentEvent): boolean {
  return INTENT_TRANSITIONS.some((r) => r.from === from && r.event === event);
}

type PaymentRule = { from: PaymentStatus; to: PaymentStatus };

const PAYMENT_TRANSITIONS: readonly PaymentRule[] = [
  { from: "created", to: "authorized" },
  { from: "created", to: "failed" },
  { from: "authorized", to: "captured" },
  { from: "authorized", to: "failed" },
  { from: "captured", to: "partially_refunded" },
  { from: "captured", to: "refunded" },
  { from: "partially_refunded", to: "refunded" },
  { from: "captured", to: "disputed" },
  { from: "partially_refunded", to: "disputed" },
  { from: "disputed", to: "captured" },
  { from: "disputed", to: "refunded" },
];

/** Rank for recognising a stale/out-of-order webhook on the non-dispute happy path (docs/08 §6.4). */
const PAYMENT_RANK: Record<PaymentStatus, number> = {
  created: 0,
  authorized: 1,
  captured: 2,
  partially_refunded: 3,
  refunded: 4,
  failed: -1,
  disputed: 5,
};

export type PaymentTransitionOutcome =
  { kind: "apply"; to: PaymentStatus } | { kind: "stale" } | { kind: "invalid" };

/**
 * Resolves an incoming provider status against the current one. A valid forward transition
 * applies; a status at or behind the current rank (and not an explicit transition, e.g. a delayed
 * `authorized` arriving after we're already `captured`) is a stale no-op, never an error.
 */
export function resolvePaymentTransition(
  current: PaymentStatus,
  incoming: PaymentStatus,
): PaymentTransitionOutcome {
  if (current === incoming) return { kind: "stale" };
  const explicit = PAYMENT_TRANSITIONS.some((r) => r.from === current && r.to === incoming);
  if (explicit) return { kind: "apply", to: incoming };
  if (
    current !== "failed" &&
    current !== "disputed" &&
    PAYMENT_RANK[incoming] <= PAYMENT_RANK[current]
  ) {
    return { kind: "stale" };
  }
  return { kind: "invalid" };
}

export type RefundEvent =
  "provider_accepted" | "provider_rejected" | "provider_processed" | "provider_failed" | "retry";

type RefundRule = { from: RefundStatus; event: RefundEvent; to: RefundStatus };

const REFUND_TRANSITIONS: readonly RefundRule[] = [
  { from: "requested", event: "provider_accepted", to: "pending" },
  { from: "requested", event: "provider_rejected", to: "failed" },
  { from: "pending", event: "provider_processed", to: "processed" },
  { from: "pending", event: "provider_failed", to: "failed" },
  { from: "failed", event: "retry", to: "requested" },
];

export function transitionRefund(from: RefundStatus, event: RefundEvent): RefundStatus {
  const rule = REFUND_TRANSITIONS.find((r) => r.from === from && r.event === event);
  if (!rule) throw new Error(`No refund transition for event "${event}" from "${from}"`);
  return rule.to;
}

export function canTransitionRefund(from: RefundStatus, event: RefundEvent): boolean {
  return REFUND_TRANSITIONS.some((r) => r.from === from && r.event === event);
}

export type TransferEvent =
  | "payment_captured"
  | "payment_never_captured"
  | "hold_elapsed_clear"
  | "full_refund_before_release"
  | "partial_refund_before_release"
  | "settlement_confirmed"
  | "post_release_clawback"
  | "clawback_after_settlement"
  | "reverse"
  | "provider_failed"
  | "retry";

type TransferRule = { from: TransferStatus; event: TransferEvent; to: TransferStatus };

const TRANSFER_TRANSITIONS: readonly TransferRule[] = [
  { from: "pending", event: "payment_captured", to: "on_hold" },
  { from: "pending", event: "payment_never_captured", to: "cancelled" },
  { from: "on_hold", event: "hold_elapsed_clear", to: "released" },
  { from: "on_hold", event: "full_refund_before_release", to: "reversed" },
  { from: "on_hold", event: "partial_refund_before_release", to: "partially_reversed" },
  { from: "on_hold", event: "provider_failed", to: "failed" },
  { from: "failed", event: "retry", to: "on_hold" },
  { from: "released", event: "settlement_confirmed", to: "settled" },
  { from: "released", event: "post_release_clawback", to: "partially_reversed" },
  { from: "released", event: "reverse", to: "reversed" },
  { from: "settled", event: "clawback_after_settlement", to: "partially_reversed" },
  { from: "settled", event: "reverse", to: "reversed" },
];

export function transitionTransfer(from: TransferStatus, event: TransferEvent): TransferStatus {
  const rule = TRANSFER_TRANSITIONS.find((r) => r.from === from && r.event === event);
  if (!rule) throw new Error(`No transfer transition for event "${event}" from "${from}"`);
  return rule.to;
}

export function canTransitionTransfer(from: TransferStatus, event: TransferEvent): boolean {
  return TRANSFER_TRANSITIONS.some((r) => r.from === from && r.event === event);
}

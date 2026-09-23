import type { Provider } from "../domain/types";

/**
 * Outbound port every provider adapter implements (ports & adapters, docs/04 §4; docs/08 §2, §14).
 * `FakeGateway` is the only implementation this phase — a real Razorpay adapter needs live test-mode
 * API keys this environment doesn't have, so it's deliberately not built yet (docs/19 Phase 8
 * deviations), rather than shipping payment-provider code that has never actually talked to Razorpay.
 */
export type PaymentGateway = {
  provider: Provider;

  createOrder(input: {
    amountMinor: number;
    currency: string;
    receipt: string;
  }): Promise<{ providerOrderId: string }>;

  createRefund(input: {
    providerPaymentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string }>;

  createLinkedAccount(input: { mentorUserId: string }): Promise<{ providerAccountId: string }>;

  createTransfer(input: {
    providerAccountId: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ providerTransferId: string }>;

  releaseTransfer(providerTransferId: string): Promise<void>;
  reverseTransfer(providerTransferId: string, amountMinor: number): Promise<void>;

  /** Re-fetches authoritative state from the provider (docs/08 §6 rule 4/5) — used by the sweeper
   * and by client-confirm verification, never trusted from the client alone. */
  fetchPaymentStatus(providerOrderId: string): Promise<{
    status: "created" | "authorized" | "captured" | "failed";
    providerPaymentId: string | null;
    amountMinor: number | null;
  }>;
};

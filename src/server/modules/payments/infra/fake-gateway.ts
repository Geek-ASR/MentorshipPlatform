import { createHmac, timingSafeEqual } from "node:crypto";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import type { PaymentGateway } from "../application/ports";
import {
  findFakePaymentAttempt,
  insertFakeLinkedAccount,
  insertFakePaymentAttempt,
  insertFakeRefundAttempt,
  insertFakeTransfer,
  setFakePaymentAttemptOutcome,
  setFakeTransferStatus,
} from "./fake-psp-repo";

/**
 * Dev/test-only shared secret for signing fake webhook payloads (docs/08 §14). Not a real secret:
 * the route it protects is compiled out unless `PAYMENTS_PROVIDER=fake` and `NODE_ENV !== "production"`
 * (enforced in the route handler), so this never needs production-grade secrecy.
 */
export const FAKE_WEBHOOK_SECRET = "fake-psp-dev-only-not-a-real-secret";

export function signFakeWebhookPayload(rawBody: string): string {
  return createHmac("sha256", FAKE_WEBHOOK_SECRET).update(rawBody).digest("hex");
}

export function verifyFakeWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = Buffer.from(signFakeWebhookPayload(rawBody));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Chaos-injection knobs for Phase 13's provider-timeout/outage tests (docs/13 §1 "chaos-style
 * tests"). `delayMs` simulates a slow provider on every call; `failOnce` simulates a provider
 * outage/timeout on exactly the next call to that method (auto-resets after firing once, so a test
 * can assert a single failed attempt followed by a normal retry).
 */
export type FakeGatewayChaos = {
  delayMs?: number;
  failOnce?: Partial<Record<keyof Omit<PaymentGateway, "provider">, boolean>>;
};

/** Implements `PaymentGateway` against our own `fake_psp` schema — a stand-in "outside world"
 * independent of our domain rows, so the payment sweeper genuinely has something to re-fetch from
 * rather than trusting only what already happened via webhook (docs/08 §14). */
export function createFakeGateway(
  executor: Executor,
  chaos: FakeGatewayChaos = {},
): PaymentGateway {
  async function chaosGate(method: keyof NonNullable<FakeGatewayChaos["failOnce"]>): Promise<void> {
    if (chaos.delayMs) await new Promise((resolve) => setTimeout(resolve, chaos.delayMs));
    if (chaos.failOnce?.[method]) {
      chaos.failOnce[method] = false;
      throw new Error(`fake gateway: injected chaos failure for ${method}`);
    }
  }

  return {
    provider: "fake",

    async createOrder({ amountMinor, currency }) {
      await chaosGate("createOrder");
      const providerOrderId = `fake_order_${newId()}`;
      await insertFakePaymentAttempt(executor, { providerOrderId, amountMinor, currency });
      return { providerOrderId };
    },

    async createRefund({ providerPaymentId, amountMinor }) {
      await chaosGate("createRefund");
      const providerRefundId = `fake_refund_${newId()}`;
      await insertFakeRefundAttempt(executor, { providerRefundId, providerPaymentId, amountMinor });
      return { providerRefundId };
    },

    async createLinkedAccount() {
      await chaosGate("createLinkedAccount");
      // Fake onboarding auto-approves (docs/19 Phase 8 scope: "payout accounts (fake onboarding)").
      const account = await insertFakeLinkedAccount(executor, "active");
      return { providerAccountId: account.id };
    },

    async createTransfer({ providerAccountId, amountMinor }) {
      await chaosGate("createTransfer");
      const providerTransferId = `fake_transfer_${newId()}`;
      await insertFakeTransfer(executor, {
        providerTransferId,
        linkedAccountId: providerAccountId,
        amountMinor,
      });
      return { providerTransferId };
    },

    async releaseTransfer(providerTransferId) {
      await chaosGate("releaseTransfer");
      await setFakeTransferStatus(executor, providerTransferId, "released", new Date());
    },

    async reverseTransfer(providerTransferId) {
      await chaosGate("reverseTransfer");
      await setFakeTransferStatus(executor, providerTransferId, "reversed", new Date());
    },

    async fetchPaymentStatus(providerOrderId) {
      await chaosGate("fetchPaymentStatus");
      const attempt = await findFakePaymentAttempt(executor, providerOrderId);
      if (!attempt) return { status: "failed", providerPaymentId: null, amountMinor: null };
      return {
        status: attempt.status,
        providerPaymentId: attempt.providerPaymentId,
        amountMinor: attempt.amountMinor,
      };
    },
  };
}

export type FakeCheckoutOutcome = "succeed" | "fail" | "dispute";

export type FakeWebhookPayload = { body: string; signature: string; eventType: string };

/**
 * Drives the dev checkout page's outcome buttons (docs/08 §14): flips the fake provider's own
 * state and returns a signed webhook payload for the caller to dispatch to `/api/webhooks/fake` —
 * dispatch is the caller's job (a real `fetch` from the dev page, or a direct route-handler call
 * from a test) so this function stays a pure DB + signing step, easy to exercise either way.
 */
export async function simulateFakeCheckout(
  executor: Executor,
  providerOrderId: string,
  outcome: FakeCheckoutOutcome,
  now: Date,
): Promise<FakeWebhookPayload> {
  const attempt = await findFakePaymentAttempt(executor, providerOrderId);
  if (!attempt) throw new Error(`No fake payment attempt for ${providerOrderId}`);

  if (outcome === "fail") {
    await setFakePaymentAttemptOutcome(executor, providerOrderId, "failed", null, now);
    return buildPayload("payment.failed", {
      payload: { payment: { entity: { order_id: providerOrderId, status: "failed" } } },
    });
  }

  const providerPaymentId = `fake_payment_${newId()}`;
  await setFakePaymentAttemptOutcome(executor, providerOrderId, "captured", providerPaymentId, now);
  const eventType = outcome === "dispute" ? "payment.dispute.created" : "payment.captured";
  return buildPayload(eventType, {
    payload: {
      payment: {
        entity: {
          id: providerPaymentId,
          order_id: providerOrderId,
          status: "captured",
          amount: attempt.amountMinor,
          currency: attempt.currency,
        },
      },
    },
  });
}

function buildPayload(eventType: string, body: { payload: unknown }): FakeWebhookPayload {
  const full = { id: `evt_fake_${newId()}`, event: eventType, ...body };
  const rawBody = JSON.stringify(full);
  return { body: rawBody, signature: signFakeWebhookPayload(rawBody), eventType };
}

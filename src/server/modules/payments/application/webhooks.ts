import { z } from "zod";
import type { Database } from "@/server/platform/db/client";
import { defineJob, enqueueJob } from "@/server/platform/outbox/outbox";
import { resolvePaymentTransition } from "../domain/state-machines";
import type { Provider } from "../domain/types";
import { createFakeGateway, verifyFakeWebhookSignature } from "../infra/fake-gateway";
import { findPaymentIntentByProviderOrderId } from "../infra/payment-intents-repo";
import { findPaymentByProviderPaymentId, setPaymentStatus } from "../infra/payments-repo";
import {
  findWebhookEvent,
  insertWebhookEvent,
  setWebhookEventStatus,
  type WebhookEventRow,
} from "../infra/webhook-events-repo";
import { applyVerifiedCapture } from "./apply-capture";

export type ReceiveWebhookResult =
  { status: "accepted" } | { status: "duplicate" } | { status: "invalid_signature" };

/**
 * The webhook route's job (docs/08 §6): verify signature over the raw bytes, dedupe on
 * `(provider, provider_event_id)`, enqueue processing, acknowledge fast. Only `fake` is wired up —
 * a Razorpay `X-Razorpay-Signature` check would go here once a real adapter exists.
 *
 * Processing here is deliberately payment-side only (payment row, intent transition, ledger,
 * transfer) — it never calls into `booking`. `booking`'s own `syncPaidBookings` recurring job
 * (docs/08 §10 "payment sweeper") notices the now-`succeeded` intent and confirms the booking from
 * its side. A webhook handler that called `booking` directly would make `payments` and `booking`
 * import each other's public index — a real circular module dependency (docs/19 Phase 8).
 */
export async function receiveWebhook(
  db: Database,
  provider: Provider,
  rawBody: string,
  signature: string,
): Promise<ReceiveWebhookResult> {
  if (provider === "fake" && !verifyFakeWebhookSignature(rawBody, signature)) {
    return { status: "invalid_signature" };
  }

  let parsed: { id: string; event: string; payload: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: "invalid_signature" };
  }

  return db.transaction(async (tx) => {
    const result = await insertWebhookEvent(tx, {
      provider,
      providerEventId: parsed.id,
      eventType: parsed.event,
      payload: parsed.payload as Record<string, unknown>,
    });
    if (!result.inserted) return { status: "duplicate" };
    await enqueueJob(
      tx,
      processPaymentWebhook,
      { webhookEventId: result.row.id },
      { dedupeKey: `webhook:${provider}:${parsed.id}` },
    );
    return { status: "accepted" };
  });
}

type CapturedPayload = {
  payment: { entity: { id: string; order_id: string; amount: number; currency: string } };
};

async function handleCaptureOrDispute(
  db: Database,
  event: WebhookEventRow,
  isDispute: boolean,
  now: Date,
): Promise<void> {
  const entity = (event.payload as CapturedPayload).payment.entity;
  const intent = await findPaymentIntentByProviderOrderId(db, event.provider, entity.order_id);
  if (!intent) return; // not one of our orders; nothing to do

  // Webhooks are hints — re-fetch authoritative state before trusting the payload (docs/08 §6 rule 4/5).
  const gateway = createFakeGateway(db);
  const authoritative = await gateway.fetchPaymentStatus(intent.providerOrderId);
  if (authoritative.status !== "captured" || authoritative.providerPaymentId !== entity.id) return;

  if (isDispute) {
    const payment = await findPaymentByProviderPaymentId(db, event.provider, entity.id);
    if (payment) {
      const resolution = resolvePaymentTransition(payment.status, "disputed");
      if (resolution.kind === "apply") await setPaymentStatus(db, payment.id, resolution.to, now);
    }
    return;
  }

  await applyVerifiedCapture(
    db,
    gateway,
    intent,
    { providerPaymentId: entity.id, amountMinor: entity.amount, currency: entity.currency },
    now,
  );
}

async function processWebhookEventById(
  db: Database,
  webhookEventId: string,
  now: Date,
): Promise<void> {
  const event = await findWebhookEvent(db, webhookEventId);
  if (!event || event.status !== "received") return;

  try {
    if (event.eventType === "payment.captured") {
      await handleCaptureOrDispute(db, event, false, now);
    } else if (event.eventType === "payment.dispute.created") {
      await handleCaptureOrDispute(db, event, true, now);
    } else if (event.eventType === "payment.failed") {
      // A single failed attempt does not fail the intent (docs/08 §5.1) — the student may retry
      // with another method while the hold is valid. Nothing to record or transition.
    } else {
      await setWebhookEventStatus(db, event.id, "ignored", now);
      return;
    }
    await setWebhookEventStatus(db, event.id, "processed", now);
  } catch (error) {
    await setWebhookEventStatus(db, event.id, "failed", now);
    throw error;
  }
}

export const processPaymentWebhook = defineJob({
  type: "payments.process_webhook",
  schema: z.object({ webhookEventId: z.uuid() }),
  maxAttempts: 8,
  async handle(payload, { db, clock }) {
    await processWebhookEventById(db, payload.webhookEventId, clock.now());
  },
});

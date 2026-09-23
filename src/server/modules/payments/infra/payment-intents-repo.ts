import { and, eq, lte } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { paymentIntents } from "./tables";
import type { PaymentIntentStatus, Provider } from "../domain/types";

export type PaymentIntentRow = typeof paymentIntents.$inferSelect;

export async function insertPaymentIntent(
  executor: Executor,
  input: {
    orderId: string;
    provider: Provider;
    providerOrderId: string;
    amountMinor: number;
    currency: string;
    holdExpiresAt: Date | null;
  },
): Promise<PaymentIntentRow> {
  // `createCheckout` only calls this after `gateway.createOrder` has already succeeded, so the
  // provider order genuinely exists by the time this row is written — insert straight into
  // `pending` (the `provider_order_created` transition's target). Leaving this at the table's
  // `created` default would strand every intent there forever: neither the capture-verification
  // transitions (`capture_verified`/`late_capture_verified`, both only legal from `pending`) nor
  // the expiry sweep (`listExpiredPendingIntents`, which only looks at `pending`) can ever reach it.
  const [row] = await executor
    .insert(paymentIntents)
    .values({ id: newId(), status: "pending", version: 0, ...input })
    .returning();
  return row!;
}

export async function findPaymentIntent(
  executor: Executor,
  id: string,
): Promise<PaymentIntentRow | undefined> {
  const [row] = await executor
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.id, id))
    .limit(1);
  return row;
}

export async function findPaymentIntentByProviderOrderId(
  executor: Executor,
  provider: Provider,
  providerOrderId: string,
): Promise<PaymentIntentRow | undefined> {
  const [row] = await executor
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.provider, provider),
        eq(paymentIntents.providerOrderId, providerOrderId),
      ),
    )
    .limit(1);
  return row;
}

export async function findPaymentIntentByOrder(
  executor: Executor,
  orderId: string,
): Promise<PaymentIntentRow | undefined> {
  const [row] = await executor
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.orderId, orderId))
    .limit(1);
  return row;
}

/** Compare-and-set on `version`, matching booking's optimistic-concurrency pattern. */
export async function transitionPaymentIntent(
  executor: Executor,
  id: string,
  expectedVersion: number,
  to: PaymentIntentStatus,
  now: Date,
): Promise<PaymentIntentRow | undefined> {
  const [row] = await executor
    .update(paymentIntents)
    .set({ status: to, version: expectedVersion + 1, updatedAt: now })
    .where(and(eq(paymentIntents.id, id), eq(paymentIntents.version, expectedVersion)))
    .returning();
  return row;
}

/** `pending` intents whose hold has expired without a verified capture (payment sweeper input). */
export async function listExpiredPendingIntents(
  executor: Executor,
  now: Date,
): Promise<PaymentIntentRow[]> {
  return executor
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.status, "pending"), lte(paymentIntents.holdExpiresAt, now)));
}

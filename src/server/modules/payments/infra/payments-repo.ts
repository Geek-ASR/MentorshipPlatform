import { and, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { orders, paymentIntents, payments } from "./tables";
import type { PaymentStatus, Provider } from "../domain/types";

export type PaymentRow = typeof payments.$inferSelect;

export async function insertPayment(
  executor: Executor,
  input: {
    paymentIntentId: string;
    provider: Provider;
    providerPaymentId: string;
    status: PaymentStatus;
    amountMinor: number;
    currency: string;
    method: string | null;
  },
): Promise<PaymentRow> {
  const [row] = await executor
    .insert(payments)
    .values({ id: newId(), refundedMinor: 0, ...input })
    .returning();
  return row!;
}

export async function findPayment(executor: Executor, id: string): Promise<PaymentRow | undefined> {
  const [row] = await executor.select().from(payments).where(eq(payments.id, id)).limit(1);
  return row;
}

export async function findPaymentByProviderPaymentId(
  executor: Executor,
  provider: Provider,
  providerPaymentId: string,
): Promise<PaymentRow | undefined> {
  const [row] = await executor
    .select()
    .from(payments)
    .where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, providerPaymentId)))
    .limit(1);
  return row;
}

export async function listPaymentsForIntent(
  executor: Executor,
  paymentIntentId: string,
): Promise<PaymentRow[]> {
  return executor.select().from(payments).where(eq(payments.paymentIntentId, paymentIntentId));
}

export async function setPaymentStatus(
  executor: Executor,
  id: string,
  status: PaymentStatus,
  now: Date,
): Promise<PaymentRow | undefined> {
  const [row] = await executor
    .update(payments)
    .set({ status, updatedAt: now })
    .where(eq(payments.id, id))
    .returning();
  return row;
}

/** A student's own payment history (docs/06 §7.6 `GET /me/payments`). */
export async function listPaymentsForStudent(
  executor: Executor,
  studentId: string,
): Promise<PaymentRow[]> {
  const rows = await executor
    .select({ payment: payments })
    .from(payments)
    .innerJoin(paymentIntents, eq(paymentIntents.id, payments.paymentIntentId))
    .innerJoin(orders, eq(orders.id, paymentIntents.orderId))
    .where(eq(orders.studentId, studentId))
    .orderBy(desc(payments.createdAt));
  return rows.map((r) => r.payment);
}

/** Atomically increments `refunded_minor` — the DB's own CHECK (0..amount_minor) is the real guard
 * against over-refunding under concurrent refund attempts (docs/13 §6 refund double-submit). */
export async function addRefundedAmount(
  executor: Executor,
  id: string,
  additionalMinor: number,
  status: PaymentStatus,
  now: Date,
): Promise<PaymentRow | undefined> {
  const [row] = await executor
    .update(payments)
    .set({
      refundedMinor: sql`${payments.refundedMinor} + ${additionalMinor}`,
      status,
      updatedAt: now,
    })
    .where(eq(payments.id, id))
    .returning();
  return row;
}

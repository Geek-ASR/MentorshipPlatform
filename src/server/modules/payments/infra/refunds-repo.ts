import { desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { orders, paymentIntents, payments, refunds } from "./tables";
import type { Provider, RefundInitiator, RefundStatus } from "../domain/types";

export type RefundRow = typeof refunds.$inferSelect;

export async function insertRefund(
  executor: Executor,
  input: {
    paymentId: string;
    amountMinor: number;
    currency: string;
    reasonCode: string;
    idempotencyKey: string;
    provider: Provider;
    initiatedBy: RefundInitiator;
  },
): Promise<RefundRow> {
  const [row] = await executor
    .insert(refunds)
    .values({ id: newId(), status: "requested", providerRefundId: null, ...input })
    .returning();
  return row!;
}

export async function findRefundByIdempotencyKey(
  executor: Executor,
  idempotencyKey: string,
): Promise<RefundRow | undefined> {
  const [row] = await executor
    .select()
    .from(refunds)
    .where(eq(refunds.idempotencyKey, idempotencyKey))
    .limit(1);
  return row;
}

export async function findRefund(executor: Executor, id: string): Promise<RefundRow | undefined> {
  const [row] = await executor.select().from(refunds).where(eq(refunds.id, id)).limit(1);
  return row;
}

export async function listRefundsForPayment(
  executor: Executor,
  paymentId: string,
): Promise<RefundRow[]> {
  return executor.select().from(refunds).where(eq(refunds.paymentId, paymentId));
}

/** A student's own refund history (docs/06 §7.6 `GET /me/refunds`). */
export async function listRefundsForStudent(
  executor: Executor,
  studentId: string,
): Promise<RefundRow[]> {
  const rows = await executor
    .select({ refund: refunds })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(paymentIntents, eq(paymentIntents.id, payments.paymentIntentId))
    .innerJoin(orders, eq(orders.id, paymentIntents.orderId))
    .where(eq(orders.studentId, studentId))
    .orderBy(desc(refunds.createdAt));
  return rows.map((r) => r.refund);
}

export async function updateRefundStatus(
  executor: Executor,
  id: string,
  status: RefundStatus,
  providerRefundId: string | null,
  now: Date,
): Promise<RefundRow | undefined> {
  const [row] = await executor
    .update(refunds)
    .set({ status, providerRefundId: providerRefundId ?? undefined, updatedAt: now })
    .where(eq(refunds.id, id))
    .returning();
  return row;
}

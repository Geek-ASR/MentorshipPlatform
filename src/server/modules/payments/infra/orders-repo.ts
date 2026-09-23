import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { orderItems, orders } from "./tables";
import type { FeeBearer } from "../domain/types";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

export async function insertOrder(
  executor: Executor,
  input: { studentId: string; totalMinor: number; currency: string },
): Promise<OrderRow> {
  const [row] = await executor
    .insert(orders)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function insertOrderItem(
  executor: Executor,
  input: {
    orderId: string;
    bookingId: string;
    mentorUserId: string;
    unitAmountMinor: number;
    commissionRuleId: string | null;
    percentBps: number;
    commissionMinor: number;
    mentorShareMinor: number;
    studentFeeMinor: number;
    feeBearer: FeeBearer;
    currency: string;
  },
): Promise<OrderItemRow> {
  const [row] = await executor
    .insert(orderItems)
    .values({ id: newId(), quantity: 1, ...input })
    .returning();
  return row!;
}

export async function findOrder(executor: Executor, id: string): Promise<OrderRow | undefined> {
  const [row] = await executor.select().from(orders).where(eq(orders.id, id)).limit(1);
  return row;
}

export async function findOrderItemByBooking(
  executor: Executor,
  bookingId: string,
): Promise<OrderItemRow | undefined> {
  const [row] = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.bookingId, bookingId))
    .limit(1);
  return row;
}

export async function findOrderItem(
  executor: Executor,
  id: string,
): Promise<OrderItemRow | undefined> {
  const [row] = await executor.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
  return row;
}

export async function findOrderItemByOrder(
  executor: Executor,
  orderId: string,
): Promise<OrderItemRow | undefined> {
  const [row] = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .limit(1);
  return row;
}

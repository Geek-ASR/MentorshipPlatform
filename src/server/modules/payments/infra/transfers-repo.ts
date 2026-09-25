import { and, desc, eq, lte } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { payoutAccounts, transferReversals, transfers } from "./tables";
import type { Provider, TransferStatus } from "../domain/types";

export type TransferRow = typeof transfers.$inferSelect;
export type TransferReversalRow = typeof transferReversals.$inferSelect;

export async function insertTransfer(
  executor: Executor,
  input: {
    orderItemId: string;
    payoutAccountId: string;
    provider: Provider;
    providerTransferId: string;
    amountMinor: number;
    currency: string;
    holdUntil: Date;
  },
): Promise<TransferRow> {
  // `createTransferForOrderItem` (this function's only caller) only runs after capture is already
  // verified (docs/08 §5.4) — nothing ever fires the `payment_captured` event that would move a
  // `pending` transfer to `on_hold`, so inserting at `pending` would strand it there forever
  // (mirroring the `payment_intents` gap fixed alongside this one). Insert straight into `on_hold`.
  const [row] = await executor
    .insert(transfers)
    .values({ id: newId(), status: "on_hold", ...input })
    .returning();
  return row!;
}

export async function findTransfer(
  executor: Executor,
  id: string,
): Promise<TransferRow | undefined> {
  const [row] = await executor.select().from(transfers).where(eq(transfers.id, id)).limit(1);
  return row;
}

/** docs/06 §7.9 `GET /admin/transfers`. */
export async function listTransfersForAdmin(
  executor: Executor,
  options: { status?: TransferStatus; limit?: number } = {},
): Promise<TransferRow[]> {
  const limit = options.limit ?? 50;
  const query = executor.select().from(transfers);
  const rows = options.status
    ? await query
        .where(eq(transfers.status, options.status))
        .orderBy(desc(transfers.createdAt))
        .limit(limit)
    : await query.orderBy(desc(transfers.createdAt)).limit(limit);
  return rows;
}

export async function findTransferByOrderItem(
  executor: Executor,
  orderItemId: string,
): Promise<TransferRow | undefined> {
  const [row] = await executor
    .select()
    .from(transfers)
    .where(eq(transfers.orderItemId, orderItemId))
    .limit(1);
  return row;
}

export async function setTransferHoldUntil(
  executor: Executor,
  id: string,
  holdUntil: Date,
): Promise<void> {
  await executor.update(transfers).set({ holdUntil }).where(eq(transfers.id, id));
}

export async function setTransferStatus(
  executor: Executor,
  id: string,
  status: TransferStatus,
  now: Date,
): Promise<TransferRow | undefined> {
  const [row] = await executor
    .update(transfers)
    .set({ status, updatedAt: now })
    .where(eq(transfers.id, id))
    .returning();
  return row;
}

/** `on_hold` transfers whose hold has elapsed — input to the transfer releaser job. */
export async function listReleasableTransfers(
  executor: Executor,
  now: Date,
): Promise<TransferRow[]> {
  return executor
    .select()
    .from(transfers)
    .where(and(eq(transfers.status, "on_hold"), lte(transfers.holdUntil, now)));
}

/** A mentor's own earnings view (docs/06 §7.6 money views — "earnings"). */
export async function listTransfersForMentor(
  executor: Executor,
  mentorUserId: string,
): Promise<TransferRow[]> {
  const rows = await executor
    .select({ transfer: transfers })
    .from(transfers)
    .innerJoin(payoutAccounts, eq(payoutAccounts.id, transfers.payoutAccountId))
    .where(eq(payoutAccounts.mentorUserId, mentorUserId))
    .orderBy(desc(transfers.createdAt));
  return rows.map((r) => r.transfer);
}

export async function insertTransferReversal(
  executor: Executor,
  input: { transferId: string; amountMinor: number; reason: string },
): Promise<TransferReversalRow> {
  const [row] = await executor
    .insert(transferReversals)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

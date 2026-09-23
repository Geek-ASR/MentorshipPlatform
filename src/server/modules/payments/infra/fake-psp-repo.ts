import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import {
  fakeLinkedAccounts,
  fakePaymentAttempts,
  fakeRefundAttempts,
  fakeTransfers,
  type FakeLinkedAccountStatus,
  type FakePaymentAttemptStatus,
  type FakeTransferStatus,
} from "./tables";

export type FakePaymentAttemptRow = typeof fakePaymentAttempts.$inferSelect;

export async function insertFakePaymentAttempt(
  executor: Executor,
  input: { providerOrderId: string; amountMinor: number; currency: string },
): Promise<FakePaymentAttemptRow> {
  const [row] = await executor
    .insert(fakePaymentAttempts)
    .values({ id: newId(), status: "created", providerPaymentId: null, ...input })
    .returning();
  return row!;
}

export async function findFakePaymentAttempt(
  executor: Executor,
  providerOrderId: string,
): Promise<FakePaymentAttemptRow | undefined> {
  const [row] = await executor
    .select()
    .from(fakePaymentAttempts)
    .where(eq(fakePaymentAttempts.providerOrderId, providerOrderId))
    .limit(1);
  return row;
}

export async function setFakePaymentAttemptOutcome(
  executor: Executor,
  providerOrderId: string,
  status: FakePaymentAttemptStatus,
  providerPaymentId: string | null,
  now: Date,
): Promise<FakePaymentAttemptRow | undefined> {
  const [row] = await executor
    .update(fakePaymentAttempts)
    .set({ status, providerPaymentId: providerPaymentId ?? undefined, updatedAt: now })
    .where(eq(fakePaymentAttempts.providerOrderId, providerOrderId))
    .returning();
  return row;
}

export async function insertFakeRefundAttempt(
  executor: Executor,
  input: { providerRefundId: string; providerPaymentId: string; amountMinor: number },
): Promise<typeof fakeRefundAttempts.$inferSelect> {
  const [row] = await executor
    .insert(fakeRefundAttempts)
    .values({ id: newId(), status: "processed", ...input })
    .returning();
  return row!;
}

export async function insertFakeLinkedAccount(
  executor: Executor,
  status: FakeLinkedAccountStatus = "active",
): Promise<typeof fakeLinkedAccounts.$inferSelect> {
  const [row] = await executor
    .insert(fakeLinkedAccounts)
    .values({ id: newId(), status })
    .returning();
  return row!;
}

export async function insertFakeTransfer(
  executor: Executor,
  input: { providerTransferId: string; linkedAccountId: string; amountMinor: number },
): Promise<typeof fakeTransfers.$inferSelect> {
  const [row] = await executor
    .insert(fakeTransfers)
    .values({ id: newId(), status: "on_hold", ...input })
    .returning();
  return row!;
}

export async function setFakeTransferStatus(
  executor: Executor,
  providerTransferId: string,
  status: FakeTransferStatus,
  now: Date,
): Promise<void> {
  await executor
    .update(fakeTransfers)
    .set({ status, updatedAt: now })
    .where(eq(fakeTransfers.providerTransferId, providerTransferId));
}

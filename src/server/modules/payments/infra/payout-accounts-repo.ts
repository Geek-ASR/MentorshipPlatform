import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { payoutAccounts } from "./tables";
import type { PayoutAccountStatus, Provider } from "../domain/types";

export type PayoutAccountRow = typeof payoutAccounts.$inferSelect;

export async function findPayoutAccount(
  executor: Executor,
  mentorUserId: string,
): Promise<PayoutAccountRow | undefined> {
  const [row] = await executor
    .select()
    .from(payoutAccounts)
    .where(eq(payoutAccounts.mentorUserId, mentorUserId))
    .limit(1);
  return row;
}

export async function findPayoutAccountById(
  executor: Executor,
  id: string,
): Promise<PayoutAccountRow | undefined> {
  const [row] = await executor
    .select()
    .from(payoutAccounts)
    .where(eq(payoutAccounts.id, id))
    .limit(1);
  return row;
}

export async function upsertPayoutAccount(
  executor: Executor,
  input: {
    mentorUserId: string;
    provider: Provider;
    providerAccountId: string;
    status: PayoutAccountStatus;
  },
): Promise<PayoutAccountRow> {
  const [row] = await executor
    .insert(payoutAccounts)
    .values({ id: newId(), ...input })
    .onConflictDoUpdate({
      target: payoutAccounts.mentorUserId,
      set: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        status: input.status,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function setPayoutAccountStatus(
  executor: Executor,
  mentorUserId: string,
  status: PayoutAccountStatus,
  now: Date,
): Promise<void> {
  await executor
    .update(payoutAccounts)
    .set({ status, updatedAt: now })
    .where(eq(payoutAccounts.mentorUserId, mentorUserId));
}

import { and, eq, gt, isNull } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { verificationRequests, type VerificationMethod } from "./tables";

export type VerificationRequestRow = typeof verificationRequests.$inferSelect;

export async function createRequest(
  executor: Executor,
  input: {
    userId: string;
    affiliationId: string;
    method: VerificationMethod;
    challengedEmail: string;
    tokenHash: string;
    tokenExpiresAt: Date;
  },
): Promise<VerificationRequestRow> {
  const [row] = await executor
    .insert(verificationRequests)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

/**
 * Atomically consumes the challenge token (single use). The expiry check lives in the WHERE clause,
 * not read back afterwards — the UPDATE itself clears `tokenExpiresAt`, so checking the returned row
 * for it would always see null and reject every attempt, expired or not.
 */
export async function consumeRequestToken(
  executor: Executor,
  tokenHash: string,
  now: Date,
): Promise<VerificationRequestRow | undefined> {
  const [row] = await executor
    .update(verificationRequests)
    .set({ tokenHash: null, tokenExpiresAt: null })
    .where(
      and(
        eq(verificationRequests.tokenHash, tokenHash),
        eq(verificationRequests.status, "pending"),
        isNull(verificationRequests.decidedAt),
        gt(verificationRequests.tokenExpiresAt, now),
      ),
    )
    .returning();
  return row;
}

export async function decideRequest(
  executor: Executor,
  id: string,
  status: "approved" | "rejected",
  now: Date,
): Promise<void> {
  await executor
    .update(verificationRequests)
    .set({ status, decidedAt: now })
    .where(eq(verificationRequests.id, id));
}

export async function listRequestsForUser(
  executor: Executor,
  userId: string,
): Promise<VerificationRequestRow[]> {
  return executor
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.userId, userId));
}

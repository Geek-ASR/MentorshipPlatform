import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { authVerificationTokens, type AuthTokenPurpose } from "./tables";

export type VerificationTokenRow = typeof authVerificationTokens.$inferSelect;

export type NewToken = {
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
};

export async function insertToken(
  executor: Executor,
  input: NewToken,
): Promise<VerificationTokenRow> {
  const [row] = await executor
    .insert(authVerificationTokens)
    .values({
      id: newId(),
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row!;
}

/** Atomically consumes a token: returns it only if unexpired, unused and found (single use). */
export async function consumeToken(
  executor: Executor,
  purpose: AuthTokenPurpose,
  tokenHash: string,
  now: Date,
): Promise<VerificationTokenRow | undefined> {
  const [row] = await executor
    .update(authVerificationTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authVerificationTokens.purpose, purpose),
        eq(authVerificationTokens.tokenHash, tokenHash),
        isNull(authVerificationTokens.consumedAt),
      ),
    )
    .returning();
  if (!row) return undefined;
  if (row.expiresAt <= now) return undefined;
  return row;
}

/** Invalidates outstanding tokens of a purpose (e.g. all password-reset links after one is used). */
export async function invalidateOutstandingTokens(
  executor: Executor,
  userId: string,
  purpose: AuthTokenPurpose,
  now: Date,
): Promise<void> {
  await executor
    .update(authVerificationTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authVerificationTokens.userId, userId),
        eq(authVerificationTokens.purpose, purpose),
        isNull(authVerificationTokens.consumedAt),
      ),
    );
}

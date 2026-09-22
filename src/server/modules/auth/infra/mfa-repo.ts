import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { authBackupCodes, authTwoFactors } from "./tables";
import type { EncryptedSecret } from "./totp-encryption";

export type TwoFactorRow = typeof authTwoFactors.$inferSelect;

export async function getTwoFactorForUser(
  executor: Executor,
  userId: string,
): Promise<TwoFactorRow | undefined> {
  const [row] = await executor
    .select()
    .from(authTwoFactors)
    .where(eq(authTwoFactors.userId, userId))
    .limit(1);
  return row;
}

/** Starts (or restarts) enrolment. Not enabled until confirmed with a valid code. */
export async function upsertPendingEnrollment(
  executor: Executor,
  userId: string,
  secret: EncryptedSecret,
): Promise<void> {
  await executor
    .insert(authTwoFactors)
    .values({
      userId,
      secretCiphertext: secret.ciphertext,
      secretIv: secret.iv,
      secretTag: secret.tag,
      enabled: false,
      lastUsedCounter: null,
      confirmedAt: null,
    })
    .onConflictDoUpdate({
      target: authTwoFactors.userId,
      set: {
        secretCiphertext: secret.ciphertext,
        secretIv: secret.iv,
        secretTag: secret.tag,
        enabled: false,
        lastUsedCounter: null,
        confirmedAt: null,
      },
    });
}

export async function confirmEnrollment(
  executor: Executor,
  userId: string,
  counter: bigint,
  now: Date,
): Promise<void> {
  await executor
    .update(authTwoFactors)
    .set({ enabled: true, confirmedAt: now, lastUsedCounter: counter.toString() })
    .where(eq(authTwoFactors.userId, userId));
}

export async function recordAcceptedCounter(
  executor: Executor,
  userId: string,
  counter: bigint,
): Promise<void> {
  await executor
    .update(authTwoFactors)
    .set({ lastUsedCounter: counter.toString() })
    .where(eq(authTwoFactors.userId, userId));
}

export async function disableTwoFactor(executor: Executor, userId: string): Promise<void> {
  await executor.delete(authTwoFactors).where(eq(authTwoFactors.userId, userId));
  await executor.delete(authBackupCodes).where(eq(authBackupCodes.userId, userId));
}

export async function replaceBackupCodes(
  executor: Executor,
  userId: string,
  codeHashes: string[],
): Promise<void> {
  await executor.delete(authBackupCodes).where(eq(authBackupCodes.userId, userId));
  if (codeHashes.length === 0) return;
  await executor
    .insert(authBackupCodes)
    .values(codeHashes.map((codeHash) => ({ id: newId(), userId, codeHash })));
}

/** Atomically consumes a backup code (single use). */
export async function consumeBackupCode(
  executor: Executor,
  userId: string,
  codeHash: string,
  now: Date,
): Promise<boolean> {
  const rows = await executor
    .update(authBackupCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(authBackupCodes.userId, userId),
        eq(authBackupCodes.codeHash, codeHash),
        isNull(authBackupCodes.usedAt),
      ),
    )
    .returning({ id: authBackupCodes.id });
  return rows.length > 0;
}

export async function countUnusedBackupCodes(executor: Executor, userId: string): Promise<number> {
  const rows = await executor
    .select({ id: authBackupCodes.id })
    .from(authBackupCodes)
    .where(and(eq(authBackupCodes.userId, userId), isNull(authBackupCodes.usedAt)));
  return rows.length;
}

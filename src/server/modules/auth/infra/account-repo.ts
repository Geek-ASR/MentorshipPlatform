import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { authAccounts, type AuthProvider } from "./tables";

export type AuthAccountRow = typeof authAccounts.$inferSelect;

export async function findAccountByProvider(
  executor: Executor,
  provider: AuthProvider,
  providerAccountId: string,
): Promise<AuthAccountRow | undefined> {
  const [row] = await executor
    .select()
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.provider, provider),
        eq(authAccounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1);
  return row;
}

export async function findAccountForUser(
  executor: Executor,
  userId: string,
  provider: AuthProvider,
): Promise<AuthAccountRow | undefined> {
  const [row] = await executor
    .select()
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.provider, provider)))
    .limit(1);
  return row;
}

export async function insertCredentialAccount(
  executor: Executor,
  userId: string,
  normalizedEmail: string,
  passwordHash: string,
): Promise<AuthAccountRow> {
  const [row] = await executor
    .insert(authAccounts)
    .values({
      id: newId(),
      userId,
      provider: "credential",
      providerAccountId: normalizedEmail,
      passwordHash,
    })
    .returning();
  return row!;
}

export async function insertGoogleAccount(
  executor: Executor,
  userId: string,
  googleSub: string,
): Promise<AuthAccountRow> {
  const [row] = await executor
    .insert(authAccounts)
    .values({ id: newId(), userId, provider: "google", providerAccountId: googleSub })
    .returning();
  return row!;
}

export async function updatePasswordHash(
  executor: Executor,
  accountId: string,
  passwordHash: string,
): Promise<void> {
  await executor.update(authAccounts).set({ passwordHash }).where(eq(authAccounts.id, accountId));
}

export async function deleteAccount(executor: Executor, accountId: string): Promise<void> {
  await executor.delete(authAccounts).where(eq(authAccounts.id, accountId));
}

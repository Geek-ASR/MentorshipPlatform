import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { credentials, type CredentialKind } from "./tables";

export type CredentialRow = typeof credentials.$inferSelect;

export async function issueCredential(
  executor: Executor,
  input: {
    userId: string;
    affiliationId: string;
    kind: CredentialKind;
    publicLabel: string;
    verifiedAt: Date;
    expiresAt: Date;
  },
): Promise<CredentialRow> {
  const [row] = await executor
    .insert(credentials)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function listCredentialsForUser(
  executor: Executor,
  userId: string,
): Promise<CredentialRow[]> {
  return executor.select().from(credentials).where(eq(credentials.userId, userId));
}

/** Active meaning not revoked/expired *right now* — expiry is time-relative, so `now` is required. */
export async function countActiveCredentials(
  executor: Executor,
  userId: string,
  now: Date,
): Promise<number> {
  const rows = await executor
    .select({ id: credentials.id })
    .from(credentials)
    .where(
      and(
        eq(credentials.userId, userId),
        eq(credentials.status, "active"),
        or(isNull(credentials.expiresAt), gt(credentials.expiresAt, now)),
      ),
    );
  return rows.length;
}

export async function revokeCredential(executor: Executor, id: string): Promise<void> {
  await executor.update(credentials).set({ status: "revoked" }).where(eq(credentials.id, id));
}

export async function findCredentialByAffiliation(
  executor: Executor,
  affiliationId: string,
): Promise<CredentialRow | undefined> {
  const [row] = await executor
    .select()
    .from(credentials)
    .where(eq(credentials.affiliationId, affiliationId))
    .limit(1);
  return row;
}

import { and, eq, isNull, ne } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { authSessions } from "./tables";

export type SessionRow = typeof authSessions.$inferSelect;

export type NewSession = {
  userId: string;
  tokenHash: string;
  authTime: Date;
  mfaVerified: boolean;
  expiresAt: Date;
  ipPrefix: string | null;
  userAgentHash: string | null;
};

export async function createSession(executor: Executor, input: NewSession): Promise<SessionRow> {
  const [row] = await executor
    .insert(authSessions)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function findSessionByTokenHash(
  executor: Executor,
  tokenHash: string,
): Promise<SessionRow | undefined> {
  const [row] = await executor
    .select()
    .from(authSessions)
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);
  return row;
}

export async function touchLastSeen(
  executor: Executor,
  sessionId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(authSessions)
    .set({ lastSeenAt: now })
    .where(eq(authSessions.id, sessionId));
}

export async function revokeSession(
  executor: Executor,
  sessionId: string,
  reason: string,
  now: Date,
): Promise<void> {
  await executor
    .update(authSessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(eq(authSessions.id, sessionId));
}

/** Revokes every active session for a user (docs/07 §5 revocation triggers). */
export async function revokeAllSessionsForUser(
  executor: Executor,
  userId: string,
  reason: string,
  now: Date,
  exceptSessionId?: string,
): Promise<void> {
  const conditions = [
    eq(authSessions.userId, userId),
    isNull(authSessions.revokedAt),
    ...(exceptSessionId ? [ne(authSessions.id, exceptSessionId)] : []),
  ];
  await executor
    .update(authSessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(...conditions));
}

export async function listActiveSessionsForUser(
  executor: Executor,
  userId: string,
): Promise<SessionRow[]> {
  return executor
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
}

export async function markSessionMfaVerified(
  executor: Executor,
  sessionId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(authSessions)
    .set({ mfaVerified: true, authTime: now })
    .where(eq(authSessions.id, sessionId));
}

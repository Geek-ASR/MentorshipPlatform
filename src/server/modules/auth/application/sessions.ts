import { sha256Hex } from "@/server/platform/crypto";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { writeAudit } from "@/server/platform/audit";
import { AppError } from "@/server/platform/errors";
import {
  listActiveSessionsForUser,
  revokeAllSessionsForUser,
  revokeSession,
  type SessionRow,
} from "../infra/session-repo";

export type SessionSummary = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  ipPrefix: string | null;
  isCurrent: boolean;
};

export async function listSessions(
  userId: string,
  currentToken: string | null,
  deps: { db: Database },
): Promise<SessionSummary[]> {
  const currentHash = currentToken ? sha256Hex(currentToken) : null;
  const rows: SessionRow[] = await listActiveSessionsForUser(deps.db, userId);
  return rows
    .map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      ipPrefix: row.ipPrefix,
      isCurrent: currentHash !== null && row.tokenHash === currentHash,
    }))
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

/** "Sign out of all devices" (docs/07 §3.7): revokes every session, including the current one. */
export async function revokeAllSessions(
  userId: string,
  deps: { db: Database; clock: Clock },
): Promise<void> {
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    await revokeAllSessionsForUser(tx, userId, "user_revoked_all", now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "auth.sessions_revoked_all",
      targetType: "user",
      targetId: userId,
    });
  });
}

/**
 * Signs out one chosen device (ASVS 7.5.2 "terminate any … session"). Only the caller's own active
 * sessions are addressable — any other id, including another user's, is a plain 404 so session ids
 * can't be probed.
 */
export async function revokeOwnSession(
  userId: string,
  sessionId: string,
  deps: { db: Database; clock: Clock },
): Promise<void> {
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    const active = await listActiveSessionsForUser(tx, userId);
    if (!active.some((session) => session.id === sessionId)) throw new AppError("NOT_FOUND");
    await revokeSession(tx, sessionId, "user_revoked", now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "auth.session_revoked",
      targetType: "auth_session",
      targetId: sessionId,
    });
  });
}

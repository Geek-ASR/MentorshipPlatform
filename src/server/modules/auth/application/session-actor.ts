import {
  anonymousActor,
  STAFF_ROLES,
  type Actor,
  type UserActor,
} from "@/server/platform/authz/actor";
import { sha256Hex } from "@/server/platform/crypto";
import type { Executor } from "@/server/platform/db/client";
import { findSessionByTokenHash, touchLastSeen } from "../infra/session-repo";
import { findUserById, rolesForUser } from "../infra/user-repo";
import { isSessionExpired, shouldRefreshLastSeen } from "../domain/session-policy";

/**
 * Resolves the bearer session cookie into an Actor (docs/07 §5). Called on every authenticated
 * request via the platform actor-resolver, so it fails safe (anonymous) on anything unexpected
 * rather than throwing — a missing/invalid/expired session must never surface as a 500.
 */
export async function resolveSessionActor(
  executor: Executor,
  token: string | null,
  now: Date,
): Promise<Actor> {
  if (!token) return anonymousActor;
  const tokenHash = sha256Hex(token);
  const session = await findSessionByTokenHash(executor, tokenHash);
  if (!session) return anonymousActor;

  const user = await findUserById(executor, session.userId);
  if (!user) return anonymousActor;

  const roles = await rolesForUser(executor, session.userId);
  const isStaffUser = roles.some((role) => STAFF_ROLES.has(role));
  if (isSessionExpired(session, isStaffUser, now)) return anonymousActor;

  if (shouldRefreshLastSeen(session.lastSeenAt, now)) {
    await touchLastSeen(executor, session.id, now).catch(() => undefined);
  }

  const actor: UserActor = {
    kind: "user",
    userId: user.id,
    sessionId: session.id,
    roles: new Set(roles),
    status: user.status,
    // Trust & safety restrictions land in Phase 10; every actor has none until then.
    restrictions: [],
    emailVerified: user.emailVerified,
    mfaVerified: session.mfaVerified,
    authenticatedAt: session.authTime,
  };
  return actor;
}

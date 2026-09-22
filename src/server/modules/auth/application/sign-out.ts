import { sha256Hex } from "@/server/platform/crypto";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { findSessionByTokenHash, revokeSession } from "../infra/session-repo";

/** Idempotent: signing out an already-revoked or unknown session is not an error. */
export async function signOut(token: string, deps: { db: Database; clock: Clock }): Promise<void> {
  const session = await findSessionByTokenHash(deps.db, sha256Hex(token));
  if (!session || session.revokedAt) return;
  await revokeSession(deps.db, session.id, "user_sign_out", deps.clock.now());
}

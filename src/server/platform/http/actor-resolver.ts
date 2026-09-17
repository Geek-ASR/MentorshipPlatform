import { anonymousActor, type Actor } from "../authz/actor";
import type { Database } from "../db/client";

/**
 * Resolves the authenticated actor for a request. Phase 5 replaces this with Better Auth session
 * lookup (DB-backed sessions, roles, restrictions). Until then every request is anonymous, so no
 * route can accidentally trust client-supplied identity.
 */
export async function resolveActor(_request: Request, _db: Database): Promise<Actor> {
  return anonymousActor;
}

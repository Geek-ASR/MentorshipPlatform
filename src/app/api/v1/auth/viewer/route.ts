import { defineRoute } from "@/server/platform/http/route";
import { findUserById, mfaStatus, toMeDto } from "@/server/modules/auth";

/**
 * Session probe for statically rendered pages (docs/19 Phase 15): the public header asks "is anyone
 * signed in?" without the 401 that `GET /auth/me` correctly returns to an anonymous caller, so an
 * ordinary signed-out page view never logs a failed request.
 */
export const GET = defineRoute(
  { name: "GET /api/v1/auth/viewer" },
  async ({ actor, getDb, env, clock }) => {
    if (actor.kind !== "user") return { body: { viewer: null } };
    const db = await getDb();
    const user = await findUserById(db, actor.userId);
    if (!user) return { body: { viewer: null } };
    const { enabled } = await mfaStatus(actor.userId, {
      db,
      clock,
      mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
    });
    return { body: { viewer: toMeDto(user, actor, enabled) } };
  },
);

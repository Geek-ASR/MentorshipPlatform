import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { buildClearSessionCookie, revokeAllSessions } from "@/server/modules/auth";

/** Signs out every device, including this one — the client must treat the response as signed out. */
export const POST = defineRoute(
  { name: "POST /api/v1/auth/sessions/revoke-all" },
  async ({ actor, env, getDb, clock }) => {
    const db = await getDb();
    const now = clock.now();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    await revokeAllSessions(actor.userId, { db, clock });
    return { status: 204, headers: { "set-cookie": buildClearSessionCookie(env) } };
  },
);

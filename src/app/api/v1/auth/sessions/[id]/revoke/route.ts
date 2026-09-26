import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { buildClearSessionCookie, revokeOwnSession } from "@/server/modules/auth";

const paramsSchema = z.object({ id: z.uuid() });

/** Signs out one of the caller's own devices (ASVS 7.5.2). Revoking the current session also
 * clears this browser's cookie, exactly like signing out. */
export const POST = defineRoute(
  { name: "POST /api/v1/auth/sessions/:id/revoke", params: paramsSchema },
  async ({ actor, params, env, getDb, clock }) => {
    const db = await getDb();
    const now = clock.now();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    await revokeOwnSession(actor.userId, params.id, { db, clock });
    return params.id === actor.sessionId
      ? { status: 204, headers: { "set-cookie": buildClearSessionCookie(env) } }
      : { status: 204 };
  },
);

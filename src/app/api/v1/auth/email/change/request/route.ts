import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { requestEmailChange } from "@/server/modules/auth";

const bodySchema = z.object({ newEmail: z.email().max(320) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/email/change/request",
    body: bodySchema,
    rateLimit: { limit: 5, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, body, env, getDb, clock }) => {
    const db = await getDb();
    const now = clock.now();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    await requestEmailChange(actor.userId, body.newEmail, {
      db,
      clock,
      appBaseUrl: env.APP_BASE_URL,
    });
    return { status: 202, body: { outcome: "check_inbox" } };
  },
);

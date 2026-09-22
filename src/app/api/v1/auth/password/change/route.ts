import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { changePassword, createHibpChecker } from "@/server/modules/auth";
import { getLogger } from "@/server/platform/logger";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

export const POST = defineRoute(
  { name: "POST /api/v1/auth/password/change", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    const db = await getDb();
    const now = clock.now();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    await changePassword(
      actor.userId,
      { currentPassword: body.currentPassword, newPassword: body.newPassword },
      { db, clock, checkBreached: createHibpChecker(getLogger()), keepSessionId: actor.sessionId },
    );
    return { status: 204 };
  },
);

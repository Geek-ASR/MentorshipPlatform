import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { disableMfa } from "@/server/modules/auth";

export const POST = defineRoute(
  { name: "POST /api/v1/auth/mfa/disable" },
  async ({ actor, env, getDb, clock }) => {
    const db = await getDb();
    const now = clock.now();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    await disableMfa(actor.userId, { db, clock, mfaEncryptionKey: env.MFA_ENCRYPTION_KEY });
    return { status: 204 };
  },
);

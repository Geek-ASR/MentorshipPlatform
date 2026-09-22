import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { confirmMfaEnrollment } from "@/server/modules/auth";

const bodySchema = z.object({ code: z.string().min(6).max(6) });

export const POST = defineRoute(
  { name: "POST /api/v1/auth/mfa/enroll/confirm", body: bodySchema },
  async ({ actor, body, env, getDb, clock }) => {
    const db = await getDb();
    const now = clock.now();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const result = await confirmMfaEnrollment(actor.userId, body.code, {
      db,
      clock,
      mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
    });
    return { body: result };
  },
);

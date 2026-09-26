import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { resendVerificationEmail } from "@/server/modules/auth";

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/verify-email/resend",
    rateLimit: { limit: 3, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, env, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await resendVerificationEmail(actor.userId, {
      db: await getDb(),
      clock,
      appBaseUrl: env.APP_BASE_URL,
    });
    return { status: 202, body: result };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { requestPasswordReset } from "@/server/modules/auth";

const bodySchema = z.object({ email: z.email().max(320) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/password/reset/request",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 10, windowSeconds: 3600, by: "ip" },
  },
  async ({ body, env, getDb, clock }) => {
    await requestPasswordReset(body.email, {
      db: await getDb(),
      clock,
      appBaseUrl: env.APP_BASE_URL,
    });
    return { status: 202, body: { outcome: "check_inbox" } };
  },
);

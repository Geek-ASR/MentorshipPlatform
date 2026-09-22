import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { confirmEmailChange } from "@/server/modules/auth";

const bodySchema = z.object({ token: z.string().min(16).max(256) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/email/change/confirm",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 10, windowSeconds: 3600, by: "ip" },
  },
  async ({ body, env, getDb, clock }) => {
    await confirmEmailChange(body.token, {
      db: await getDb(),
      clock,
      appBaseUrl: env.APP_BASE_URL,
    });
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { createHibpChecker, resetPassword } from "@/server/modules/auth";
import { getLogger } from "@/server/platform/logger";

const bodySchema = z.object({
  token: z.string().min(16).max(256),
  newPassword: z.string().min(1).max(128),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/password/reset/confirm",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 10, windowSeconds: 3600, by: "ip" },
  },
  async ({ body, getDb, clock }) => {
    await resetPassword(
      { token: body.token, newPassword: body.newPassword },
      { db: await getDb(), clock, checkBreached: createHibpChecker(getLogger()) },
    );
    return { status: 204 };
  },
);

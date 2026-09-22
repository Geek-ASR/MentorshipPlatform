import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { revertEmailChange } from "@/server/modules/auth";

const bodySchema = z.object({ token: z.string().min(16).max(256) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/email/change/revert",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 10, windowSeconds: 3600, by: "ip" },
  },
  async ({ body, getDb, clock }) => {
    await revertEmailChange(body.token, { db: await getDb(), clock });
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { verifyEmail } from "@/server/modules/auth";

const bodySchema = z.object({ token: z.string().min(16).max(256) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/verify-email",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 20, windowSeconds: 3600, by: "ip" },
  },
  async ({ body, getDb, clock }) => {
    await verifyEmail(body.token, { db: await getDb(), clock });
    return { status: 204 };
  },
);

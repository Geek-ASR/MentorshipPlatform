import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { confirmEmailChallenge } from "@/server/modules/verification";

const bodySchema = z.object({ token: z.string().min(16).max(256) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/verification/email-challenge/confirm",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 20, windowSeconds: 3600, by: "ip" },
  },
  async ({ body, getDb, clock }) => {
    const result = await confirmEmailChallenge(await getDb(), body.token, { clock });
    return { body: result };
  },
);

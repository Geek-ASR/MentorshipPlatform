import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { requestEmailChallenge } from "@/server/modules/verification";

const bodySchema = z.object({ affiliationId: z.uuid(), email: z.email().max(320) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/me/verification/email-challenge",
    body: bodySchema,
    rateLimit: { limit: 10, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, body, env, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await requestEmailChallenge(await getDb(), actor.userId, body.affiliationId, body.email, {
      clock,
      appBaseUrl: env.APP_BASE_URL,
    });
    return { status: 202, body: { outcome: "check_inbox" } };
  },
);

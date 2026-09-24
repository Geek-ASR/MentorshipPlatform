import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { claimWaitlistOffer } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  intakeAnswers: z
    .array(z.object({ questionId: z.string().min(1).max(80), value: z.string().max(2000) }))
    .max(20)
    .default([]),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/waitlist-offers/:id/claim",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock, env }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await claimWaitlistOffer(
      await getDb(),
      actor,
      params.id,
      body.intakeAnswers,
      clock.now(),
      env.APP_BASE_URL,
    );
    return { status: 201, body: result };
  },
);

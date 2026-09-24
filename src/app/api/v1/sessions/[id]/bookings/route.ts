import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { bookSeat } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  intakeAnswers: z
    .array(z.object({ questionId: z.string().min(1).max(80), value: z.string().max(2000) }))
    .max(20)
    .default([]),
  inviteToken: z.string().min(1).max(200).optional(),
});

/** Group-seat / free-event registration (docs/09 §6.2, §9). */
export const POST = defineRoute(
  {
    name: "POST /api/v1/sessions/:id/bookings",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
    rateLimit: { limit: 20, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, params, body, getDb, clock, env }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await bookSeat(
      await getDb(),
      actor,
      { sessionId: params.id, intakeAnswers: body.intakeAnswers, inviteToken: body.inviteToken },
      clock.now(),
      env.APP_BASE_URL,
    );
    return { status: 201, body: result };
  },
);

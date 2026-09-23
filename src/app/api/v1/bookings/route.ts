import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { createBooking } from "@/server/modules/booking";

const bodySchema = z.object({
  mentorUserId: z.uuid(),
  serviceId: z.uuid(),
  durationMin: z.number().int().min(15).max(180),
  startsAt: z.iso.datetime(),
  intakeAnswers: z
    .array(z.object({ questionId: z.string().min(1).max(80), value: z.string().max(2000) }))
    .max(20)
    .default([]),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/bookings",
    body: bodySchema,
    idempotency: "required",
    rateLimit: { limit: 20, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, body, getDb, clock, env }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await createBooking(
      await getDb(),
      actor,
      { ...body, startsAt: new Date(body.startsAt) },
      clock.now(),
      env.APP_BASE_URL,
    );
    return { status: 201, body: result };
  },
);

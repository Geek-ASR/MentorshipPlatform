import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { createReview } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(4000),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/bookings/:id/review",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const review = await createReview(await getDb(), actor.userId, params.id, body, clock.now());
    return { status: 201, body: review };
  },
);

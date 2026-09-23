import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { cancelBooking } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  reasonCode: z.string().min(1).max(60),
  note: z.string().max(2000).optional(),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/bookings/:id/cancel",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await cancelBooking(await getDb(), actor, params.id, body, clock.now());
    return { body: result };
  },
);

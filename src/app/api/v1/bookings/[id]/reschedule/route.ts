import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { requestReschedule } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ startsAt: z.iso.datetime() });

export const POST = defineRoute(
  {
    name: "POST /api/v1/bookings/:id/reschedule",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await requestReschedule(
      await getDb(),
      actor,
      params.id,
      new Date(body.startsAt),
      clock.now(),
    );
    return { status: result.applied ? 200 : 202, body: result };
  },
);

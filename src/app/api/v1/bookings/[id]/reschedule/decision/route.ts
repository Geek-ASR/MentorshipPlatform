import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { decideReschedule } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ requestId: z.uuid(), decision: z.enum(["accept", "decline"]) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/bookings/:id/reschedule/decision",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await decideReschedule(
      await getDb(),
      actor,
      params.id,
      body.requestId,
      body.decision,
      clock.now(),
    );
    return { body: result };
  },
);

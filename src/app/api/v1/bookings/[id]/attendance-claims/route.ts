import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { ATTENDANCE_CLAIM_OUTCOMES, submitAttendanceClaim } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  outcome: z.enum(ATTENDANCE_CLAIM_OUTCOMES),
  note: z.string().max(2000).optional(),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/bookings/:id/attendance-claims",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await submitAttendanceClaim(
      await getDb(),
      actor,
      params.id,
      body.outcome,
      body.note ?? null,
      clock.now(),
    );
    return { status: 204 };
  },
);

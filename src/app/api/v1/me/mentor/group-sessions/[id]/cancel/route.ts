import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { cancelGroupSession } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  {
    name: "POST /api/v1/me/mentor/group-sessions/:id/cancel",
    params: paramsSchema,
    idempotency: "required",
  },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await cancelGroupSession(await getDb(), actor.userId, params.id, clock.now());
    return { status: 204 };
  },
);

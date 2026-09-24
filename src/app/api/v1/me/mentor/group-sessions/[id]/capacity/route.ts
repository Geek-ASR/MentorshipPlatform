import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { updateGroupSessionCapacity } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ capacity: z.number().int().min(2).max(100) });

export const PATCH = defineRoute(
  {
    name: "PATCH /api/v1/me/mentor/group-sessions/:id/capacity",
    params: paramsSchema,
    body: bodySchema,
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const session = await updateGroupSessionCapacity(
      await getDb(),
      actor.userId,
      params.id,
      body.capacity,
      clock.now(),
    );
    return { body: session };
  },
);

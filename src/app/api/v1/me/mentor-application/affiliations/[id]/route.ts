import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { removeMentorAffiliation } from "@/server/modules/profiles";

const paramsSchema = z.object({ id: z.uuid() });

export const DELETE = defineRoute(
  { name: "DELETE /api/v1/me/mentor-application/affiliations/:id", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await removeMentorAffiliation(await getDb(), actor.userId, params.id);
    return { status: 204 };
  },
);

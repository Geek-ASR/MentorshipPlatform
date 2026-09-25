import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getDisputeForParticipant } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/disputes/:id", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const dispute = await getDisputeForParticipant(await getDb(), actor.userId, params.id);
    return { body: dispute };
  },
);

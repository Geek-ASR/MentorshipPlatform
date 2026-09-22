import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { setMentorExpertise } from "@/server/modules/profiles";

const bodySchema = z.object({ termIds: z.array(z.uuid()).max(20) });

export const PUT = defineRoute(
  { name: "PUT /api/v1/me/mentor-application/expertise", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await setMentorExpertise(await getDb(), actor.userId, body.termIds);
    return { status: 204 };
  },
);

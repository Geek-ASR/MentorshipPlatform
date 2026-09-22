import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { toggleSavedMentor } from "@/server/modules/profiles";

const paramsSchema = z.object({ mentorUserId: z.uuid() });

export const POST = defineRoute(
  { name: "POST /api/v1/me/saved-mentors/:mentorUserId", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await toggleSavedMentor(await getDb(), actor.userId, params.mentorUserId, true);
    return { status: 204 };
  },
);

export const DELETE = defineRoute(
  { name: "DELETE /api/v1/me/saved-mentors/:mentorUserId", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await toggleSavedMentor(await getDb(), actor.userId, params.mentorUserId, false);
    return { status: 204 };
  },
);

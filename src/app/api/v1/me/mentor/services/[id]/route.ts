import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { setMentorServiceActive } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ isActive: z.boolean() });

export const PATCH = defineRoute(
  { name: "PATCH /api/v1/me/mentor/services/:id", params: paramsSchema, body: bodySchema },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await setMentorServiceActive(await getDb(), actor.userId, params.id, body.isActive);
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { cancelEvent } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  { name: "POST /api/v1/me/events/:id/cancel", params: paramsSchema, idempotency: "required" },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await cancelEvent(await getDb(), actor.userId, params.id, clock.now());
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { checkIn } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  { name: "POST /api/v1/sessions/:id/check-in", params: paramsSchema, idempotency: "required" },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await checkIn(await getDb(), actor, params.id, clock.now());
    return { status: 204 };
  },
);

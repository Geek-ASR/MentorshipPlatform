import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { joinWaitlist, leaveWaitlist } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  { name: "POST /api/v1/sessions/:id/waitlist", params: paramsSchema, idempotency: "required" },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const entry = await joinWaitlist(await getDb(), actor, params.id, clock.now());
    return { status: 201, body: entry };
  },
);

export const DELETE = defineRoute(
  { name: "DELETE /api/v1/sessions/:id/waitlist", params: paramsSchema, idempotency: "required" },
  async ({ actor, params, getDb, clock, env }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await leaveWaitlist(await getDb(), actor, params.id, clock.now(), env.APP_BASE_URL);
    return { status: 204 };
  },
);

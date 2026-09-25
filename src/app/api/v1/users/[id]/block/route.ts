import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { blockUser, unblockUser } from "@/server/modules/auth";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ reasonCode: z.string().trim().min(1).max(60).optional() });

export const POST = defineRoute(
  {
    name: "POST /api/v1/users/:id/block",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const block = await blockUser(await getDb(), actor.userId, params.id, body.reasonCode ?? null);
    return { status: 201, body: block };
  },
);

export const DELETE = defineRoute(
  { name: "DELETE /api/v1/users/:id/block", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await unblockUser(await getDb(), actor.userId, params.id);
    return { status: 204 };
  },
);

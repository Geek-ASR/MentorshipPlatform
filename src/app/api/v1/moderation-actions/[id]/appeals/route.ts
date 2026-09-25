import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { openAppeal } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ statement: z.string().trim().min(1).max(2000) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/moderation-actions/:id/appeals",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const appeal = await openAppeal(await getDb(), actor.userId, params.id, body.statement);
    return { status: 201, body: appeal };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { excuseTrustEventById } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(2000) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/trust-events/:id/excuse",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const event = await excuseTrustEventById(await getDb(), params.id, actor.userId, body.reason);
    return { body: event };
  },
);

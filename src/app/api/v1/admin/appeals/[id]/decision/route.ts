import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { decideAppeal } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  status: z.enum(["upheld", "modified", "overturned"]),
  note: z.string().trim().max(2000).optional(),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/appeals/:id/decision",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
    rateLimit: { limit: 60, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const appeal = await decideAppeal(
      await getDb(),
      {
        appealId: params.id,
        status: body.status,
        reviewerId: actor.userId,
        note: body.note ?? null,
      },
      clock.now(),
    );
    return { body: appeal };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { assignCaseToStaff } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ staffUserId: z.uuid().optional() });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/cases/:id/assign",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await assignCaseToStaff(await getDb(), params.id, body.staffUserId ?? actor.userId);
    return { status: 204 };
  },
);

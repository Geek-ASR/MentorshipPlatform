import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { deactivateCommissionRule } from "@/server/modules/payments";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const DELETE = defineRoute(
  { name: "DELETE /api/v1/admin/commission-rules/:id", params: paramsSchema, body: bodySchema },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await deactivateCommissionRule(await getDb(), actor.userId, params.id, body.reason);
    return { status: 204 };
  },
);

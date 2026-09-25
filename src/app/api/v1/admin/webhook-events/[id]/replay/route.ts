import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { replayWebhookEvent } from "@/server/modules/payments";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/webhook-events/:id/replay",
    params: paramsSchema,
    idempotency: "required",
  },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin", "finance"]), undefined, {
      now: clock.now(),
    });
    await replayWebhookEvent(await getDb(), params.id, clock.now());
    return { status: 204 };
  },
);

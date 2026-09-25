import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { retryOutboxJob } from "@/server/platform/outbox/outbox";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  { name: "POST /api/v1/admin/outbox/:id/retry", params: paramsSchema, idempotency: "required" },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    await retryOutboxJob(await getDb(), params.id, clock.now());
    return { status: 204 };
  },
);

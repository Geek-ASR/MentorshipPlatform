import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { revokeModerationAction } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ rationale: z.string().trim().min(1).max(2000) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/moderation-actions/:id/revoke",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
    rateLimit: { limit: 60, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await revokeModerationAction(
      await getDb(),
      params.id,
      actor.userId,
      body.rationale,
      clock.now(),
    );
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { adminHoldTransfer } from "@/server/modules/payments";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/transfers/:id/hold",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["finance", "admin", "super_admin"]), undefined, { now });
    const db = await getDb();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const transfer = await adminHoldTransfer(db, actor.userId, params.id, body.reason);
    return { body: transfer };
  },
);

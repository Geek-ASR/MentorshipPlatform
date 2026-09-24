import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { ROLES } from "@/server/platform/authz/actor";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { findUserById, grantRole } from "@/server/modules/auth";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ role: z.enum(ROLES) });

/**
 * docs/06 `POST /admin/users/{id}/roles` ⏱ — super_admin only, step-up required. The only way
 * `event_host` (docs/07 §6.1) is ever granted this phase; a fuller admin user-management UI is
 * Phase 11's own scope.
 */
export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/users/:id/roles",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["super_admin"]), undefined, { now });
    const db = await getDb();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const target = await findUserById(db, params.id);
    if (!target) throw new AppError("NOT_FOUND");
    await grantRole(db, params.id, body.role, actor.userId);
    await writeAudit(db, {
      actorType: "staff",
      actorUserId: actor.userId,
      action: "user.role_granted",
      targetType: "user",
      targetId: params.id,
      metadata: { role: body.role },
    });
    return { status: 204 };
  },
);

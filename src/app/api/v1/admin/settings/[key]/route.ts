import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { settingsRegistry, type SettingKey } from "@/server/platform/settings/registry";
import { getSetting, updateSetting } from "@/server/platform/settings/settings";

const paramsSchema = z.object({ key: z.string() });
const bodySchema = z.object({ value: z.unknown(), reason: z.string().trim().min(3).max(500) });

function assertKnownKey(key: string): asserts key is SettingKey {
  if (!(key in settingsRegistry)) throw new AppError("NOT_FOUND");
}

export const PUT = defineRoute(
  {
    name: "PUT /api/v1/admin/settings/:key",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    assertKnownKey(params.key);
    const now = clock.now();
    // docs/17's own registry: "critical keys require super_admin to change" — enforced here, the
    // one place this admin route exists (the registry only documented the intent until now).
    const requiredRoles = settingsRegistry[params.key].critical
      ? (["super_admin"] as const)
      : (["admin", "super_admin"] as const);
    authorize(actor, requireStaff(requiredRoles), undefined, { now });
    const db = await getDb();
    // docs/07 §5: settings changes require step-up.
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const result = await updateSetting(db, params.key, body.value, {
      userId: actor.userId,
      actorType: "staff",
      reason: body.reason,
    });
    return { body: result };
  },
);

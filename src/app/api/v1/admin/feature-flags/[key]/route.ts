import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { featureFlagRegistry, type FeatureFlagKey } from "@/server/platform/settings/registry";
import { getSetting, setFeatureFlag } from "@/server/platform/settings/settings";

const paramsSchema = z.object({ key: z.string() });
const bodySchema = z.object({ enabled: z.boolean(), reason: z.string().trim().min(3).max(500) });

function assertKnownKey(key: string): asserts key is FeatureFlagKey {
  if (!(key in featureFlagRegistry)) throw new AppError("NOT_FOUND");
}

export const PUT = defineRoute(
  {
    name: "PUT /api/v1/admin/feature-flags/:key",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    assertKnownKey(params.key);
    const now = clock.now();
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now });
    const db = await getDb();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    await setFeatureFlag(db, params.key, body.enabled, {
      userId: actor.userId,
      actorType: "staff",
      reason: body.reason,
    });
    return { status: 204 };
  },
);

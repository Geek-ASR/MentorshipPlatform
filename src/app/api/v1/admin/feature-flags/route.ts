import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listFeatureFlagsForAdmin } from "@/server/platform/settings/settings";

export const GET = defineRoute(
  { name: "GET /api/v1/admin/feature-flags" },
  async ({ actor, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now });
    const flags = await listFeatureFlagsForAdmin(await getDb(), now);
    return { body: { flags } };
  },
);

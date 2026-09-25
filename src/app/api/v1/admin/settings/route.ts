import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listSettingsForAdmin } from "@/server/platform/settings/settings";

export const GET = defineRoute(
  { name: "GET /api/v1/admin/settings" },
  async ({ actor, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now });
    const settings = await listSettingsForAdmin(await getDb(), now);
    return { body: { settings } };
  },
);

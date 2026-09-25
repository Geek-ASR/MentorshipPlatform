import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listCredentialsForAdmin } from "@/server/modules/verification";

export const GET = defineRoute(
  { name: "GET /api/v1/admin/verification-requests" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireStaff(["verification_reviewer", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const credentials = await listCredentialsForAdmin(await getDb());
    return { body: { credentials } };
  },
);

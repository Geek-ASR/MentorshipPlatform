import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listPolicyRulesForAdmin } from "@/server/modules/trust";

export const GET = defineRoute(
  { name: "GET /api/v1/admin/policy-rules" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    const rules = await listPolicyRulesForAdmin(await getDb());
    return { body: { rules } };
  },
);

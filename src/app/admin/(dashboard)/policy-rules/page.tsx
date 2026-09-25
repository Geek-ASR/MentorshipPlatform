import { listPolicyRulesForAdmin } from "@/server/modules/trust";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { CardDescription, CardTitle } from "@/ui/card";
import { PolicyRuleRow } from "./policy-rule-row";

export const metadata = { title: "Policy rules" };

export default async function AdminPolicyRulesPage() {
  await requireStaffPage(["admin", "super_admin"], "/admin/policy-rules");
  const rules = await listPolicyRulesForAdmin(await getDb());

  return (
    <div className="max-w-3xl">
      <CardTitle className="text-2xl">Policy rules</CardTitle>
      <CardDescription>
        The trust &amp; safety enforcement ladder (docs/10 §4.3/§5/§6) — toggle or edit a rule body.
      </CardDescription>
      <div className="mt-6 space-y-3">
        {rules.map((r) => (
          <PolicyRuleRow key={r.id} rule={r} />
        ))}
      </div>
    </div>
  );
}

import { listFeatureFlagsForAdmin } from "@/server/platform/settings/settings";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { CardDescription, CardTitle } from "@/ui/card";
import { FlagRow } from "./flag-row";

export const metadata = { title: "Feature flags" };

export default async function AdminFeatureFlagsPage() {
  await requireStaffPage(["admin", "super_admin"], "/admin/feature-flags");
  const flags = await listFeatureFlagsForAdmin(await getDb(), new Date());

  return (
    <div className="max-w-2xl">
      <CardTitle className="text-2xl">Feature flags</CardTitle>
      <CardDescription>
        No application code gates on these yet (docs/19 Phase 11 retrospective) — infrastructure
        only, ready for the first feature that needs a kill switch.
      </CardDescription>
      <div className="mt-6 space-y-3">
        {flags.map((f) => (
          <FlagRow key={f.key} flag={f} />
        ))}
      </div>
    </div>
  );
}

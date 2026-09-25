import { listSettingsForAdmin } from "@/server/platform/settings/settings";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { SettingRow } from "./setting-row";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const actor = await requireStaffPage(["admin", "super_admin"], "/admin/settings");
  const settings = await listSettingsForAdmin(await getDb(), new Date());

  return (
    <div className="max-w-3xl">
      <CardTitle className="text-2xl">Settings</CardTitle>
      <CardDescription>
        Business rules (docs/17). Every change is versioned and audited with a reason.{" "}
        <Badge tone="accent">Critical keys need super_admin</Badge>
      </CardDescription>
      <div className="mt-6 space-y-3">
        {settings.map((s) => (
          <SettingRow key={s.key} setting={s} canEditCritical={actor.roles.has("super_admin")} />
        ))}
      </div>
    </div>
  );
}

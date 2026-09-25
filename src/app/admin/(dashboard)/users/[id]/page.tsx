import { notFound } from "next/navigation";
import {
  findUserById,
  listRestrictionRowsForUser,
  rolesForUser,
  toActiveRestrictions,
} from "@/server/modules/auth";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { GrantRoleForm } from "./grant-role-form";

export const metadata = { title: "User detail" };

export default async function AdminUserDetailPage({ params }: PageProps<"/admin/users/[id]">) {
  const actor = await requireStaffPage(
    ["admin", "super_admin", "moderator", "finance"],
    "/admin/users",
  );
  const { id } = await params;
  const db = await getDb();
  const [user, roles, restrictionRows] = await Promise.all([
    findUserById(db, id),
    rolesForUser(db, id),
    listRestrictionRowsForUser(db, id),
  ]);
  if (!user) notFound();
  const restrictions = toActiveRestrictions(restrictionRows, new Date());

  return (
    <div className="max-w-2xl">
      <CardTitle className="text-2xl">{user.displayName}</CardTitle>
      <CardDescription>
        {user.email} · <Badge>{user.status}</Badge>
      </CardDescription>

      <div className="mt-6 space-y-6">
        <Card>
          <h2 className="mb-2 font-semibold text-ink">Roles</h2>
          {roles.length === 0 ? (
            <p className="text-sm text-ink-muted">No staff/special roles.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {roles.map((role) => (
                <Badge key={role} tone="primary">
                  {role}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold text-ink">Active restrictions</h2>
          {restrictions.length === 0 ? (
            <p className="text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {restrictions.map((r) => (
                <li key={r.capability}>
                  {r.capability} —{" "}
                  {r.until ? `until ${new Date(r.until).toLocaleString()}` : "indefinite"}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {actor.roles.has("super_admin") ? <GrantRoleForm userId={user.id} /> : null}
      </div>
    </div>
  );
}

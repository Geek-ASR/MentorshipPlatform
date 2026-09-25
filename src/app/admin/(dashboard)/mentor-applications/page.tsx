import { listMentorApplicationsForAdmin } from "@/server/modules/profiles";
import { findUsersByIds } from "@/server/modules/auth";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { ReviewApplicationActions } from "./review-actions";

export const metadata = { title: "Mentor applications" };

export default async function AdminMentorApplicationsPage() {
  await requireStaffPage(["admin", "super_admin"], "/admin/mentor-applications");
  const db = await getDb();
  const applications = await listMentorApplicationsForAdmin(db, { status: "submitted" });
  const users = await findUsersByIds(
    db,
    applications.map((a) => a.userId),
  );
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div>
      <CardTitle className="text-2xl">Mentor applications</CardTitle>
      <CardDescription>Submitted, awaiting review.</CardDescription>
      <div className="mt-6">
        {applications.length === 0 ? (
          <EmptyState title="Nothing to review" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Mentor</Th>
                <Th>Slug</Th>
                <Th>Submitted</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {applications.map((a) => (
                <Tr key={a.userId}>
                  <Td>{userById.get(a.userId)?.displayName ?? a.userId}</Td>
                  <Td className="text-xs text-ink-muted">{a.slug}</Td>
                  <Td className="tabular text-xs">
                    {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}
                  </Td>
                  <Td>
                    <ReviewApplicationActions userId={a.userId} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

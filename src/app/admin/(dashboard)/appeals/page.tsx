import { listAppealsForReview } from "@/server/modules/trust";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { DecideAppealActions } from "./decide-appeal-actions";

export const metadata = { title: "Appeals" };

export default async function AdminAppealsPage() {
  await requireStaffPage(["moderator", "admin", "super_admin"], "/admin/appeals");
  const appeals = await listAppealsForReview(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Appeals</CardTitle>
      <CardDescription>
        One appeal per moderation action, within 30 days (docs/10 §7.4). Reviewed by a different
        staff member where staffing permits.
      </CardDescription>
      <div className="mt-6">
        {appeals.length === 0 ? (
          <EmptyState title="No open appeals" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Statement</Th>
                <Th>Opened</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {appeals.map((appeal) => (
                <Tr key={appeal.id}>
                  <Td className="max-w-md text-sm">{appeal.statement}</Td>
                  <Td className="tabular text-xs">{new Date(appeal.createdAt).toLocaleString()}</Td>
                  <Td>
                    <DecideAppealActions appealId={appeal.id} />
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

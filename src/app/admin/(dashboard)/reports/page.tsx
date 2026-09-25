import { listRecentReports } from "@/server/modules/trust";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Reports" };

export default async function AdminReportsPage() {
  await requireStaffPage(["moderator", "admin", "super_admin"], "/admin/reports");
  const reports = await listRecentReports(await getDb(), 100);

  return (
    <div>
      <CardTitle className="text-2xl">Reports</CardTitle>
      <CardDescription>
        Most recent user reports. Grouped into a moderation case per target — see Cases to decide.
      </CardDescription>
      <div className="mt-6">
        {reports.length === 0 ? (
          <EmptyState title="No reports yet" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Target</Th>
                <Th>Reason</Th>
                <Th>Details</Th>
                <Th>Reported</Th>
              </Tr>
            </Thead>
            <Tbody>
              {reports.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <span className="text-xs text-ink-muted">{r.targetType}</span>{" "}
                    <span className="font-mono text-xs">{r.targetId.slice(0, 8)}…</span>
                  </Td>
                  <Td>
                    <Badge>{r.reasonCode}</Badge>
                  </Td>
                  <Td className="max-w-sm truncate text-xs text-ink-muted">{r.details ?? "—"}</Td>
                  <Td className="tabular text-xs">{new Date(r.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

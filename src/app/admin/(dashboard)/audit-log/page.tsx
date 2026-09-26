import { listAuditLogsForAdmin, verifyAuditChain } from "@/server/platform/audit";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Audit log" };

export default async function AdminAuditLogPage() {
  await requireStaffPage(["admin", "super_admin"], "/admin/audit-log");
  const db = await getDb();
  const [entries, brokenAtId] = await Promise.all([
    listAuditLogsForAdmin(db, { limit: 200 }),
    verifyAuditChain(db),
  ]);

  return (
    <div>
      <CardTitle className="text-2xl">Audit log</CardTitle>
      <CardDescription>
        Most recent 200 entries · hash chain:{" "}
        {brokenAtId === null ? (
          <Badge tone="primary">intact</Badge>
        ) : (
          <Badge tone="accent">broken at #{brokenAtId}</Badge>
        )}
      </CardDescription>
      <div className="mt-6">
        <Table>
          <Thead>
            <Tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target</Th>
            </Tr>
          </Thead>
          <Tbody>
            {entries.map((e) => (
              <Tr key={e.id}>
                <Td className="tabular text-xs whitespace-nowrap">
                  {new Date(e.occurredAt).toLocaleString()}
                </Td>
                <Td className="text-xs">
                  {e.actorType}
                  {e.actorUserId ? ` · …${e.actorUserId.slice(-8)}` : ""}
                </Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td className="text-xs text-ink-muted">
                  {e.targetType ? `${e.targetType} · ${e.targetId?.slice(0, 12)}…` : "—"}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}

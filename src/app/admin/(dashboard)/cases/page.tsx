import Link from "next/link";
import { listModerationCases } from "@/server/modules/trust";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Moderation cases" };

export default async function AdminCasesPage() {
  await requireStaffPage(["moderator", "admin", "super_admin"], "/admin/cases");
  const cases = await listModerationCases(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Moderation cases</CardTitle>
      <CardDescription>Reports and policy-engine proposals awaiting a decision.</CardDescription>
      <div className="mt-6">
        {cases.length === 0 ? (
          <EmptyState title="No cases" description="Nothing needs review right now." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Target</Th>
                <Th>Status</Th>
                <Th>Opened</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {cases.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <span className="tabular text-xs text-ink-muted">{c.targetType}</span>{" "}
                    <span className="font-mono text-xs">{c.targetId.slice(0, 8)}…</span>
                  </Td>
                  <Td>
                    <Badge tone={c.status === "closed" ? "neutral" : "accent"}>{c.status}</Badge>
                  </Td>
                  <Td className="tabular text-xs">{new Date(c.openedAt).toLocaleString()}</Td>
                  <Td>
                    <Link href={`/admin/cases/${c.id}`} className="text-primary hover:underline">
                      Review
                    </Link>
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

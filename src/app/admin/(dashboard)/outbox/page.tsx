import { listOutboxJobsForAdmin } from "@/server/platform/outbox/outbox";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { ActionButton } from "@/ui/action-button";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Outbox & jobs" };

export default async function AdminOutboxPage() {
  await requireStaffPage(["admin", "super_admin"], "/admin/outbox");
  const jobs = await listOutboxJobsForAdmin(await getDb(), { limit: 100 });

  return (
    <div>
      <CardTitle className="text-2xl">Outbox &amp; jobs</CardTitle>
      <CardDescription>Background job queue — most recent 100.</CardDescription>
      <div className="mt-6">
        <Table>
          <Thead>
            <Tr>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Attempts</Th>
              <Th>Run at</Th>
              <Th>Last error</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {jobs.map((j) => (
              <Tr key={j.id}>
                <Td className="font-mono text-xs">{j.type}</Td>
                <Td>
                  <Badge
                    tone={
                      j.status === "failed"
                        ? "accent"
                        : j.status === "completed"
                          ? "primary"
                          : "neutral"
                    }
                  >
                    {j.status}
                  </Badge>
                </Td>
                <Td className="tabular">
                  {j.attempts}/{j.maxAttempts}
                </Td>
                <Td className="tabular text-xs">{new Date(j.runAt).toLocaleString()}</Td>
                <Td className="max-w-xs truncate text-xs text-danger">{j.lastError ?? "—"}</Td>
                <Td>
                  {j.status === "failed" ? (
                    <ActionButton path={`/api/v1/admin/outbox/${j.id}/retry`} variant="secondary">
                      Retry
                    </ActionButton>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}

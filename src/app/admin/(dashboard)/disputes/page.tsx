import Link from "next/link";
import { listDisputesForAdmin } from "@/server/modules/trust";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Disputes" };

export default async function AdminDisputesPage() {
  await requireStaffPage(["moderator", "finance", "admin", "super_admin"], "/admin/disputes");
  const disputes = await listDisputesForAdmin(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Disputes</CardTitle>
      <CardDescription>Session-outcome and money disputes (docs/10 §8).</CardDescription>
      <div className="mt-6">
        {disputes.length === 0 ? (
          <EmptyState title="No disputes" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Booking</Th>
                <Th>Status</Th>
                <Th>Opened</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {disputes.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-mono text-xs">…{d.bookingId.slice(-8)}</Td>
                  <Td>
                    <Badge tone={d.status === "closed" ? "neutral" : "accent"}>{d.status}</Badge>
                  </Td>
                  <Td className="tabular text-xs">{new Date(d.openedAt).toLocaleString()}</Td>
                  <Td>
                    <Link href={`/admin/disputes/${d.id}`} className="text-primary hover:underline">
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

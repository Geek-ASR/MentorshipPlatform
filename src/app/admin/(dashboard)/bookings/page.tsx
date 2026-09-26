import { listBookingsForAdmin } from "@/server/modules/booking";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Bookings" };

const STATUS_TONE: Record<string, "primary" | "neutral" | "accent"> = {
  confirmed: "primary",
  completed: "primary",
  disputed: "accent",
  no_show_mentor: "accent",
  no_show_student: "accent",
};

export default async function AdminBookingsPage() {
  await requireStaffPage(["moderator", "finance", "admin", "super_admin"], "/admin/bookings");
  const bookings = await listBookingsForAdmin(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Bookings</CardTitle>
      <CardDescription>Most recent 50 bookings platform-wide.</CardDescription>
      <div className="mt-6">
        <Table>
          <Thead>
            <Tr>
              <Th>Session</Th>
              <Th>Status</Th>
              <Th>Price</Th>
              <Th>Created</Th>
            </Tr>
          </Thead>
          <Tbody>
            {bookings.map((b) => (
              <Tr key={b.id}>
                <Td className="font-mono text-xs">…{b.sessionId.slice(-8)}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status}</Badge>
                </Td>
                <Td className="tabular">
                  {b.currency} {(b.priceMinor / 100).toLocaleString("en-IN")}
                </Td>
                <Td className="tabular text-xs">{new Date(b.createdAt).toLocaleString()}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}

import { listWebhookEvents } from "@/server/modules/payments";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { ActionButton } from "@/ui/action-button";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Webhook events" };

export default async function AdminWebhookEventsPage() {
  await requireStaffPage(["admin", "super_admin", "finance"], "/admin/webhook-events");
  const events = await listWebhookEvents(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Webhook events</CardTitle>
      <CardDescription>Provider webhook deliveries — most recent 100.</CardDescription>
      <div className="mt-6">
        <Table>
          <Thead>
            <Tr>
              <Th>Provider</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Received</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {events.map((e) => (
              <Tr key={e.id}>
                <Td className="text-xs">{e.provider}</Td>
                <Td className="font-mono text-xs">{e.eventType}</Td>
                <Td>
                  <Badge
                    tone={
                      e.status === "failed"
                        ? "accent"
                        : e.status === "processed"
                          ? "primary"
                          : "neutral"
                    }
                  >
                    {e.status}
                  </Badge>
                </Td>
                <Td className="tabular text-xs">{new Date(e.receivedAt).toLocaleString()}</Td>
                <Td>
                  {e.status === "failed" ? (
                    <ActionButton
                      path={`/api/v1/admin/webhook-events/${e.id}/replay`}
                      variant="secondary"
                    >
                      Replay
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

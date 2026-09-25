import { listTransfersForAdmin } from "@/server/modules/payments";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { ActionButton } from "@/ui/action-button";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Transfers" };

export default async function AdminTransfersPage() {
  await requireStaffPage(["finance", "admin", "super_admin"], "/admin/transfers");
  const transfers = await listTransfersForAdmin(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Transfers</CardTitle>
      <CardDescription>Mentor payouts — hold or release (docs/08 §9).</CardDescription>
      <div className="mt-6">
        {transfers.length === 0 ? (
          <EmptyState title="No transfers yet" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {transfers.map((t) => (
                <Tr key={t.id}>
                  <Td className="tabular">
                    {t.currency} {(t.amountMinor / 100).toLocaleString("en-IN")}
                  </Td>
                  <Td>
                    <Badge tone={t.status === "released" ? "primary" : "neutral"}>{t.status}</Badge>
                  </Td>
                  <Td className="tabular text-xs">{new Date(t.createdAt).toLocaleString()}</Td>
                  <Td>
                    <div className="flex gap-2">
                      {t.status === "on_hold" || t.status === "pending" ? (
                        <ActionButton
                          path={`/api/v1/admin/transfers/${t.id}/release`}
                          variant="secondary"
                        >
                          Release
                        </ActionButton>
                      ) : null}
                      {t.status !== "on_hold" &&
                      t.status !== "released" &&
                      t.status !== "reversed" ? (
                        <ActionButton
                          path={`/api/v1/admin/transfers/${t.id}/hold`}
                          body={{ reason: "admin_hold" }}
                          variant="ghost"
                        >
                          Hold
                        </ActionButton>
                      ) : null}
                    </div>
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

import { listPaymentsForAdmin } from "@/server/modules/payments";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { RefundForm } from "./refund-form";

export const metadata = { title: "Payments" };

function minorToDisplay(amountMinor: number, currency: string): string {
  return `${currency} ${(amountMinor / 100).toLocaleString("en-IN")}`;
}

export default async function AdminPaymentsPage() {
  await requireStaffPage(["finance", "admin", "super_admin"], "/admin/payments");
  const payments = await listPaymentsForAdmin(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Payments</CardTitle>
      <CardDescription>Most recent 50 payments.</CardDescription>
      <div className="mt-6">
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Amount</Th>
                <Th>Refunded</Th>
                <Th>Status</Th>
                <Th>Method</Th>
                <Th>Created</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="tabular">{minorToDisplay(p.amountMinor, p.currency)}</Td>
                  <Td className="tabular">
                    {p.refundedMinor > 0 ? minorToDisplay(p.refundedMinor, p.currency) : "—"}
                  </Td>
                  <Td>
                    <Badge tone={p.status === "captured" ? "primary" : "neutral"}>{p.status}</Badge>
                  </Td>
                  <Td className="text-xs text-ink-muted">{p.method ?? "—"}</Td>
                  <Td className="tabular text-xs">{new Date(p.createdAt).toLocaleString()}</Td>
                  <Td>
                    {p.status === "captured" || p.status === "partially_refunded" ? (
                      <RefundForm
                        paymentId={p.id}
                        maxRefundMinor={p.amountMinor - p.refundedMinor}
                        currency={p.currency}
                      />
                    ) : null}
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

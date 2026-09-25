import { listCommissionRulesForAdmin } from "@/server/modules/payments";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { ActionButton } from "@/ui/action-button";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { CreateCommissionRuleForm } from "./create-form";

export const metadata = { title: "Commission rules" };

export default async function AdminCommissionRulesPage() {
  await requireStaffPage(["admin", "super_admin", "finance"], "/admin/commission-rules");
  const rules = await listCommissionRulesForAdmin(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Commission rules</CardTitle>
      <CardDescription>
        Priority-ordered; the highest-priority matching rule wins (docs/08 §4).
      </CardDescription>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {rules.length === 0 ? (
            <EmptyState title="No commission rules yet" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Scope</Th>
                  <Th>Rate</Th>
                  <Th>Priority</Th>
                  <Th>Active</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {rules.map((r) => (
                  <Tr key={r.id}>
                    <Td className="text-xs">
                      {r.scopeType}
                      {r.scopeRef ? ` · ${r.scopeRef}` : ""}
                    </Td>
                    <Td className="tabular text-xs">
                      {(r.percentBps / 100).toFixed(2)}%
                      {r.fixedMinor > 0 ? ` + ${r.fixedMinor}` : ""}
                    </Td>
                    <Td className="tabular">{r.priority}</Td>
                    <Td>
                      <Badge tone={r.isActive ? "primary" : "neutral"}>
                        {r.isActive ? "active" : "inactive"}
                      </Badge>
                    </Td>
                    <Td>
                      {r.isActive ? (
                        <ActionButton
                          path={`/api/v1/admin/commission-rules/${r.id}`}
                          method="DELETE"
                          body={{ reason: "superseded" }}
                          variant="ghost"
                          confirmText="Deactivate this commission rule?"
                        >
                          Deactivate
                        </ActionButton>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
        <CreateCommissionRuleForm />
      </div>
    </div>
  );
}

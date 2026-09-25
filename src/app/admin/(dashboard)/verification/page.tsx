import { listCredentialsForAdmin } from "@/server/modules/verification";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";
import { RevokeCredentialButton } from "./revoke-button";

export const metadata = { title: "Verification" };

/**
 * docs/06 §7.9 `GET /admin/verification-requests`. Email-challenge verifications auto-approve
 * (docs/10 §2.4), so there's no manual decision queue yet — document-upload review needs an
 * `ObjectStore` adapter this phase still doesn't build (docs/19 Phase 6/10 retrospectives). This is
 * a listing + revoke view, not a review queue.
 */
export default async function AdminVerificationPage() {
  await requireStaffPage(["verification_reviewer", "admin", "super_admin"], "/admin/verification");
  const credentials = await listCredentialsForAdmin(await getDb());

  return (
    <div>
      <CardTitle className="text-2xl">Verification credentials</CardTitle>
      <CardDescription>
        Auto-approved via email challenge (docs/10 §2.4) — document review isn&apos;t built yet.
      </CardDescription>
      <div className="mt-6">
        <Table>
          <Thead>
            <Tr>
              <Th>Label</Th>
              <Th>Kind</Th>
              <Th>Status</Th>
              <Th>Verified</Th>
              <Th>Expires</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {credentials.map((c) => (
              <Tr key={c.id}>
                <Td className="text-sm">{c.publicLabel}</Td>
                <Td className="text-xs text-ink-muted">{c.kind}</Td>
                <Td>
                  <Badge tone={c.status === "active" ? "primary" : "neutral"}>{c.status}</Badge>
                </Td>
                <Td className="tabular text-xs">{new Date(c.verifiedAt).toLocaleDateString()}</Td>
                <Td className="tabular text-xs">
                  {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}
                </Td>
                <Td>
                  {c.status === "active" ? (
                    <RevokeCredentialButton credentialId={c.id} mentorUserId={c.userId} />
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

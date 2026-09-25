import { notFound } from "next/navigation";
import { getDisputeForAdmin, listDisputeEvidence } from "@/server/modules/trust";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { ResolveDisputeForm } from "./resolve-dispute-form";

export const metadata = { title: "Dispute detail" };

export default async function AdminDisputeDetailPage({
  params,
}: PageProps<"/admin/disputes/[id]">) {
  await requireStaffPage(["moderator", "finance", "admin", "super_admin"], "/admin/disputes");
  const { id } = await params;
  const db = await getDb();
  const dispute = await getDisputeForAdmin(db, id).catch(() => null);
  if (!dispute) notFound();
  const evidence = await listDisputeEvidence(db, id);

  const decidable = dispute.status === "under_review" || dispute.status === "appealed";

  return (
    <div className="max-w-3xl">
      <CardTitle className="text-2xl">Dispute</CardTitle>
      <CardDescription>
        Booking <span className="font-mono">{dispute.bookingId}</span> · status{" "}
        <Badge tone={dispute.status === "closed" ? "neutral" : "accent"}>{dispute.status}</Badge>
      </CardDescription>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="mb-3 font-semibold text-ink">Evidence ({evidence.length})</h2>
          {evidence.length === 0 ? (
            <p className="text-sm text-ink-muted">No evidence submitted.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {evidence.map((e) => (
                <li key={e.id} className="border-b border-line pb-2 last:border-0">
                  <Badge>{e.kind}</Badge>
                  {e.content ? <p className="mt-1 text-ink-muted">{e.content}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {dispute.resolution ? (
            <div className="mt-4 rounded-[var(--radius-control)] border border-line bg-primary-soft/30 p-3 text-sm">
              <p>
                Resolved: <strong>{dispute.resolution}</strong> ({dispute.refundPct}% refund)
              </p>
            </div>
          ) : null}
        </Card>

        {decidable ? (
          <ResolveDisputeForm disputeId={dispute.id} appealed={dispute.status === "appealed"} />
        ) : null}
      </div>
    </div>
  );
}

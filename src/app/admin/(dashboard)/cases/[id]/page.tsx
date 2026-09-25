import { notFound } from "next/navigation";
import { getCaseDetail } from "@/server/modules/trust";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { DecideCaseForm } from "./decide-case-form";

export const metadata = { title: "Case detail" };

export default async function AdminCaseDetailPage({ params }: PageProps<"/admin/cases/[id]">) {
  await requireStaffPage(["moderator", "admin", "super_admin"], "/admin/cases");
  const { id } = await params;
  const detail = await getCaseDetail(await getDb(), id).catch(() => null);
  if (!detail) notFound();

  return (
    <div className="max-w-3xl">
      <CardTitle className="text-2xl">
        Case · {detail.case.targetType} {detail.case.targetId.slice(0, 8)}…
      </CardTitle>
      <CardDescription>
        Opened {new Date(detail.case.openedAt).toLocaleString()} · status{" "}
        <Badge tone={detail.case.status === "closed" ? "neutral" : "accent"}>
          {detail.case.status}
        </Badge>
      </CardDescription>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold text-ink">Timeline</h2>
            <ol className="space-y-3 text-sm">
              {detail.events.map((event) => (
                <li key={event.id} className="border-l-2 border-line pl-3">
                  <p className="text-ink-muted">
                    <span className="font-medium text-ink">{event.kind}</span> ·{" "}
                    <span className="tabular">{new Date(event.createdAt).toLocaleString()}</span>
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded bg-primary-soft/30 p-2 text-xs whitespace-pre-wrap">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </li>
              ))}
              {detail.events.length === 0 ? (
                <li className="text-ink-muted">No events yet.</li>
              ) : null}
            </ol>
          </Card>

          {detail.reports.length > 0 ? (
            <Card>
              <h2 className="mb-3 font-semibold text-ink">Reports ({detail.reports.length})</h2>
              <ul className="space-y-2 text-sm">
                {detail.reports.map((report) => (
                  <li key={report.id} className="border-b border-line pb-2 last:border-0">
                    <p>
                      <Badge>{report.reasonCode}</Badge>
                    </p>
                    {report.details ? (
                      <p className="mt-1 text-ink-muted">{report.details}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {detail.priorActions.length > 0 ? (
            <Card>
              <h2 className="mb-3 font-semibold text-ink">
                Prior actions against this subject ({detail.priorActions.length})
              </h2>
              <ul className="space-y-1 text-sm text-ink-muted">
                {detail.priorActions.map((action) => (
                  <li key={action.id}>
                    {action.action} — {action.reasonCode} ·{" "}
                    <span className="tabular">
                      {new Date(action.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {detail.case.status !== "closed" ? (
          <div>
            <DecideCaseForm caseId={detail.case.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

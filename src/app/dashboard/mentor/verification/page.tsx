import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck, Briefcase, GraduationCap, Info } from "lucide-react";
import { getDb } from "@/server/platform/db/client";
import { loadMentorWorkspace } from "@/server/views/mentor-workspace";
import { requireViewer } from "@/server/views/viewer";
import { Alert } from "@/ui/alert";
import { formatMonthYear } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { VerifyAffiliationButton } from "./verify-button";

export const metadata: Metadata = { title: "Verification" };

export default async function VerificationPage() {
  const { user } = await requireViewer("/dashboard/mentor/verification");
  const workspace = await loadMentorWorkspace(await getDb(), user.id);
  if (!workspace) redirect("/dashboard/mentor");
  const credentialByAffiliation = new Map(
    workspace.credentials.filter((c) => c.status === "active").map((c) => [c.affiliationId, c]),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentoring"
        title="Verification"
        description="Confirm at least one university or work affiliation. Students see exactly what was checked and when."
      />
      {workspace.detail.affiliations.length === 0 ? (
        <Alert tone="info" title="Add your education or work first">
          Affiliations come from your application — add one there, then verify it here.
        </Alert>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {workspace.detail.affiliations.map((affiliation) => {
            const credential = credentialByAffiliation.get(affiliation.id);
            const Icon = affiliation.kind === "work" ? Briefcase : GraduationCap;
            return (
              <li key={affiliation.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-muted ring-1 ring-line">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{affiliation.title}</p>
                  <p className="text-sm text-ink-muted">
                    {affiliation.organizationName ?? "Organisation not listed"}
                  </p>
                  {credential ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      {affiliation.kind === "work" ? "Work" : "University"} email confirmed{" "}
                      {formatMonthYear(credential.verifiedAt)}
                    </p>
                  ) : null}
                </div>
                {credential ? null : affiliation.organizationName ? (
                  <VerifyAffiliationButton
                    affiliationId={affiliation.id}
                    organizationName={affiliation.organizationName}
                    kind={affiliation.kind}
                  />
                ) : (
                  <p className="max-w-56 text-xs text-ink-muted">
                    Organisations not in our list can&apos;t be verified by email yet.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Document upload for organisations without email domains is planned; for now, email is the
        one verification method.
      </p>
    </div>
  );
}

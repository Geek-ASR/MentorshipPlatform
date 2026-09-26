import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/platform/db/client";
import { findMentorProfile, checkApplicationCompleteness } from "@/server/modules/profiles";
import { loadApplicationDraft, loadApplicationOptions } from "@/server/views/mentor-workspace";
import { requireViewer } from "@/server/views/viewer";
import { ApplicationWizard, type WizardInitial } from "./wizard";

export const metadata: Metadata = { title: "Mentor application" };

/** docs/22 §3 J2 — the mentor application as a save-and-resume wizard. */
export default async function MentorApplicationPage() {
  const { user } = await requireViewer("/dashboard/mentor/application");
  const db = await getDb();
  const profile = await findMentorProfile(db, user.id);
  if (!profile) redirect("/dashboard/mentor");
  const [{ detail, attestation, links }, options, completeness] = await Promise.all([
    loadApplicationDraft(db, user.id),
    loadApplicationOptions(db),
    checkApplicationCompleteness(db, user.id),
  ]);
  if (!detail) redirect("/dashboard/mentor");

  const initial: WizardInitial = {
    status: profile.applicationStatus,
    payoutMode: profile.payoutMode,
    headline: detail.profile.headline ?? "",
    bio: detail.profile.bioMd ?? "",
    affiliations: detail.affiliations.map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      organizationName: a.organizationName,
      isCurrent: a.isCurrent,
    })),
    expertiseIds: detail.expertise.map((e) => e.id),
    languages: detail.languages.map((l) => ({ termId: l.id, proficiency: l.proficiency })),
    eligibility: attestation
      ? { countryIso2: attestation.countryIso2, residencyStatus: attestation.residencyStatus }
      : null,
    links: links.map((l) => ({ id: l.id, kind: l.kind, url: l.url })),
    missing: completeness.missing,
  };

  return (
    <ApplicationWizard
      initial={initial}
      options={{
        universities: options.universityRows,
        companies: options.companyRows,
        categories: options.categoryRows,
        languages: options.languageRows,
        countries: options.countryRows,
      }}
    />
  );
}

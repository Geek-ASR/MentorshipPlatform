import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/platform/db/client";
import { getSetting } from "@/server/platform/settings/settings";
import { findMentorProfile } from "@/server/modules/profiles";
import { listServicesForMentor } from "@/server/modules/booking";
import { requireViewer } from "@/server/views/viewer";
import { PageHeader } from "@/ui/page-header";
import { ServicesManager } from "./services-manager";

export const metadata: Metadata = { title: "Sessions & prices" };

export default async function ServicesPage() {
  const { user } = await requireViewer("/dashboard/mentor/services");
  const db = await getDb();
  const profile = await findMentorProfile(db, user.id);
  if (!profile) redirect("/dashboard/mentor");
  const [services, allowedDurations] = await Promise.all([
    listServicesForMentor(db, user.id),
    getSetting(db, "service.allowed_durations_min", new Date()),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentoring"
        title="Sessions & prices"
        description="What students can book with you, how long it takes, what it costs, and where you meet."
      />
      <ServicesManager
        volunteer={profile.payoutMode !== "paid"}
        allowedDurations={allowedDurations}
        services={services
          .filter((s) => s.kind === "one_on_one")
          .map((s) => ({
            id: s.id,
            title: s.title,
            description: s.descriptionMd,
            isActive: s.isActive,
            meetingUrl: s.meetingUrl,
            intakeQuestions: s.intakeQuestions,
            prices: s.prices
              .map((p) => ({
                durationMin: p.durationMin,
                priceMinor: p.priceMinor,
                currency: p.currency,
              }))
              .sort((a, b) => a.durationMin - b.durationMin),
          }))}
      />
    </div>
  );
}

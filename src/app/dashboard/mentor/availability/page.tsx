import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/platform/db/client";
import { findMentorProfile } from "@/server/modules/profiles";
import {
  getSchedulingSettings,
  listMentorAvailabilityExceptions,
  listMentorAvailabilityRules,
} from "@/server/modules/booking";
import { requireViewer } from "@/server/views/viewer";
import { PageHeader } from "@/ui/page-header";
import { AvailabilityEditor } from "./availability-editor";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const { user } = await requireViewer("/dashboard/mentor/availability");
  const db = await getDb();
  if (!(await findMentorProfile(db, user.id))) redirect("/dashboard/mentor");
  const now = new Date();
  const [settings, rules, exceptions] = await Promise.all([
    getSchedulingSettings(db, user.id, now),
    listMentorAvailabilityRules(db, user.id),
    listMentorAvailabilityExceptions(db, user.id),
  ]);
  const todayIso = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentoring"
        title="Availability"
        description="Students can only book inside these hours, with the notice and limits you choose."
      />
      <AvailabilityEditor
        settings={{
          timezone: settings.timezone,
          slotStepMin: settings.slotStepMin,
          bufferAfterMin: settings.bufferAfterMin,
          minNoticeMin: settings.minNoticeMin,
          maxAdvanceDays: settings.maxAdvanceDays,
          maxSessionsPerDay: settings.maxSessionsPerDay,
        }}
        rules={rules
          .filter((r) => !r.effectiveTo || r.effectiveTo >= todayIso)
          .map((r) => ({
            id: r.id,
            weekday: r.weekday,
            startLocal: r.startLocal,
            endLocal: r.endLocal,
          }))}
        timeOff={exceptions
          .filter((e) => e.kind === "unavailable")
          .filter((e) => e.end > now)
          .sort((a, b) => a.start.getTime() - b.start.getTime())
          .map((e) => ({ id: e.id, start: e.start.toISOString(), end: e.end.toISOString() }))}
      />
    </div>
  );
}

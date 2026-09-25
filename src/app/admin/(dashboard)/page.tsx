import { sql } from "drizzle-orm";
import { STAFF_ROLES } from "@/server/modules/auth";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { getDb } from "@/server/platform/db/client";
import { Card, CardDescription, CardTitle } from "@/ui/card";

export const metadata = { title: "Overview" };

type Counts = {
  users: number;
  mentors_approved: number;
  bookings_confirmed: number;
  gmv_minor_total: number;
  open_cases: number;
  open_disputes: number;
  pending_applications: number;
};

/** A handful of plain aggregate counts (docs/19 Phase 11 "basic analytics funnels") — deliberately
 * not a funnel-visualisation tool or a charting dependency; see the Phase 11 retrospective. */
async function loadCounts(): Promise<Counts> {
  const db = await getDb();
  const [row] = await db.execute<Counts>(sql`
    select
      (select count(*)::int from app.users) as users,
      (select count(*)::int from app.mentor_profiles where application_status = 'approved') as mentors_approved,
      (select count(*)::int from app.bookings where status in ('confirmed','awaiting_outcome','completed')) as bookings_confirmed,
      (select coalesce(sum(amount_minor - refunded_minor), 0)::bigint from app.payments where status in ('captured', 'partially_refunded')) as gmv_minor_total,
      (select count(*)::int from app.moderation_cases where status <> 'closed') as open_cases,
      (select count(*)::int from app.disputes where status not in ('closed')) as open_disputes,
      (select count(*)::int from app.mentor_profiles where application_status = 'submitted') as pending_applications
  `);
  return row!;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold text-ink">{value}</p>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  await requireStaffPage([...STAFF_ROLES], "/admin");
  const counts = await loadCounts();

  return (
    <div>
      <CardTitle className="text-2xl">Overview</CardTitle>
      <CardDescription>Snapshot across the platform — see each queue for detail.</CardDescription>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Total users" value={counts.users.toLocaleString()} />
        <Metric label="Approved mentors" value={counts.mentors_approved.toLocaleString()} />
        <Metric label="Pending applications" value={counts.pending_applications.toLocaleString()} />
        <Metric label="Live bookings" value={counts.bookings_confirmed.toLocaleString()} />
        <Metric
          label="Net GMV captured"
          value={`₹${(counts.gmv_minor_total / 100).toLocaleString("en-IN")}`}
        />
        <Metric label="Open moderation cases" value={counts.open_cases.toLocaleString()} />
        <Metric label="Open disputes" value={counts.open_disputes.toLocaleString()} />
      </div>
    </div>
  );
}

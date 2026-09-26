import type { Metadata } from "next";
import { CalendarDays, CalendarX2, History } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { loadHostedBookingTabs, loadStudentBookingTabs } from "@/server/views/sessions";
import type { SessionCardView } from "@/server/views/sessions";
import { requireViewer } from "@/server/views/viewer";
import { Button } from "@/ui/button";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { Tabs, type TabItem } from "@/ui/tabs";
import { SessionList } from "../_components/session-cards";

export const metadata: Metadata = { title: "Bookings" };

function ListOrEmpty({
  sessions,
  timeZone,
  now,
  role,
  empty,
}: {
  sessions: SessionCardView[];
  timeZone: string;
  now: Date;
  role?: "student" | "mentor";
  empty: React.ReactNode;
}) {
  if (sessions.length === 0) return <>{empty}</>;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5">
      <SessionList sessions={sessions} timeZone={timeZone} now={now} role={role} />
    </div>
  );
}

/** docs/22 §2 "Bookings": everything a person has booked, and — for mentors — everything they host. */
export default async function BookingsPage() {
  const { actor, user } = await requireViewer("/dashboard/bookings");
  const db = await getDb();
  const now = new Date();
  const timeZone = user.timezone;
  const isMentor = actor.roles.has("mentor");
  const [mine, hosted] = await Promise.all([
    loadStudentBookingTabs(db, user.id, now),
    isMentor ? loadHostedBookingTabs(db, user.id, now) : Promise.resolve(null),
  ]);

  const explore = (
    <Button asChild>
      <Link href="/mentors">Find a mentor</Link>
    </Button>
  );
  const items: TabItem[] = [
    {
      id: "upcoming",
      label: "Upcoming",
      count: mine.upcoming.length,
      content: (
        <ListOrEmpty
          sessions={mine.upcoming}
          timeZone={timeZone}
          now={now}
          empty={
            <EmptyState
              icon={<CalendarDays className="size-8" aria-hidden="true" />}
              title="Nothing booked yet"
              description="When you book a session or register for a free event, it shows up here."
              action={explore}
            />
          }
        />
      ),
    },
    {
      id: "past",
      label: "Past",
      count: mine.past.length,
      content: (
        <ListOrEmpty
          sessions={mine.past}
          timeZone={timeZone}
          now={now}
          empty={
            <EmptyState
              icon={<History className="size-8" aria-hidden="true" />}
              title="No past sessions"
              description="Sessions you've had appear here, where you can leave a review."
            />
          }
        />
      ),
    },
    {
      id: "cancelled",
      label: "Cancelled",
      count: mine.cancelled.length,
      content: (
        <ListOrEmpty
          sessions={mine.cancelled}
          timeZone={timeZone}
          now={now}
          empty={
            <EmptyState
              icon={<CalendarX2 className="size-8" aria-hidden="true" />}
              title="No cancellations"
              description="Cancelled bookings and payment holds that ended appear here, with any refund."
            />
          }
        />
      ),
    },
  ];
  if (hosted) {
    items.push({
      id: "hosting",
      label: "You're hosting",
      count: hosted.upcoming.length,
      content: (
        <div className="space-y-8">
          <ListOrEmpty
            sessions={hosted.upcoming}
            timeZone={timeZone}
            now={now}
            role="mentor"
            empty={
              <EmptyState
                icon={<CalendarDays className="size-8" aria-hidden="true" />}
                title="No upcoming sessions to host"
                description="Bookings from students appear here as soon as they're confirmed."
              />
            }
          />
          {hosted.past.length > 0 ? (
            <div>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Recently hosted</h2>
              <ListOrEmpty
                sessions={hosted.past.slice(0, 10)}
                timeZone={timeZone}
                now={now}
                role="mentor"
                empty={null}
              />
            </div>
          ) : null}
        </div>
      ),
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bookings"
        description="Your sessions and free events. Open one to join, reschedule or cancel."
      />
      <Tabs items={items} label="Bookings" />
    </div>
  );
}

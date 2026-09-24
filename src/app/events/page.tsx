import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { listPublicEvents, sessionWindow } from "@/server/modules/booking";
import { findUserById } from "@/server/modules/auth";
import { Badge } from "@/ui/badge";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

export const metadata: Metadata = {
  title: "Free events",
  description: "Live, free sessions from approved mentors — workshops, AMAs and info sessions.",
  alternates: { canonical: "/events" },
};

function formatWhen(start: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(start);
}

export default async function EventsPage() {
  const db = await getDb();
  const events = await listPublicEvents(db, new Date());
  const hosts = await Promise.all(events.map((e) => findUserById(db, e.session.hostUserId)));

  return (
    <Container className="py-12 md:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Free events
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Live, free sessions hosted by approved mentors — no payment, ever.
      </p>

      {events.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<CalendarDays className="size-8" aria-hidden="true" />}
          title="No upcoming events yet"
          description="Check back soon — new events are added regularly."
        />
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event, index) => {
            const { start } = sessionWindow(event.session);
            const host = hosts[index];
            return (
              <li key={event.sessionId}>
                <Link href={`/events/${event.slug}`} className="block h-full">
                  <Card className="h-full transition-colors hover:border-primary">
                    <CardTitle>{event.title}</CardTitle>
                    {host ? <CardDescription>Hosted by {host.displayName}</CardDescription> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge>{formatWhen(start)}</Badge>
                      <Badge tone="accent">Free</Badge>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}

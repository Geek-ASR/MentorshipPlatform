import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getDb } from "@/server/platform/db/client";
import { loadEventTeasers } from "@/server/views/home";
import { Container } from "@/ui/container";
import { EventCard } from "@/ui/event-card";
import { EmptyState } from "@/ui/states";

export const metadata: Metadata = {
  title: "Free events",
  description: "Live, free sessions from approved mentors — workshops, AMAs and info sessions.",
  alternates: { canonical: "/events" },
};

/** Seat counts change as people register — refresh the static page every minute. */
export const revalidate = 60;

export default async function EventsPage() {
  const events = await loadEventTeasers(await getDb(), new Date(), 60);

  return (
    <div>
      <section className="border-b border-line bg-surface">
        <Container className="py-10 md:py-14">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Free events
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Live, free sessions hosted by approved mentors — Q&amp;As, workshops and walkthroughs.
            No payment, ever. Times are shown in your time zone.
          </p>
        </Container>
      </section>
      <Container className="py-10">
        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" aria-hidden="true" />}
            title="No upcoming events yet"
            description="Check back soon — mentors add new events regularly."
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.slug}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users, Video } from "lucide-react";
import { getDb } from "@/server/platform/db/client";
import {
  getEventBySlug,
  listLiveBookingsForSession,
  sessionWindow,
} from "@/server/modules/booking";
import { findUserById } from "@/server/modules/auth";
import { Badge } from "@/ui/badge";
import { Container } from "@/ui/container";

type PageParams = { slug: string };

/** Only a `public` event is ever server-rendered here — `unlisted`/`private` are `noindex` and (for
 * `private`) need an invite token the page-view flow doesn't have (docs/09 §9); an authenticated
 * visitor with a link still reaches the same data through the API route directly. */
async function loadPublicEvent(slug: string) {
  const db = await getDb();
  const event = await getEventBySlug(db, slug);
  if (!event || event.visibility !== "public") return null;
  const [host, liveBookings] = await Promise.all([
    findUserById(db, event.session.hostUserId),
    listLiveBookingsForSession(db, event.sessionId),
  ]);
  return { event, host, liveSeats: liveBookings.length };
}

function formatRange(start: Date, end: Date): string {
  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZoneName: "short",
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${dateFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadPublicEvent(slug);
  if (!loaded) return { title: "Event not found", robots: { index: false, follow: false } };
  const { event } = loaded;
  return {
    title: event.title,
    description: event.descriptionMd?.slice(0, 155) ?? "A free live event on Aheadly.",
    alternates: { canonical: `/events/${slug}` },
    robots: { index: true, follow: true },
    openGraph: { type: "website", title: event.title },
  };
}

export default async function EventPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const loaded = await loadPublicEvent(slug);
  if (!loaded) notFound();
  const { event, host, liveSeats } = loaded;
  const { start, end } = sessionWindow(event.session);
  const seatsLeft = Math.max(0, event.session.capacity - liveSeats);
  const isFull = seatsLeft === 0;

  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    isAccessibleForFree: true,
    ...(host ? { organizer: { "@type": "Person", name: host.displayName } } : {}),
    location: { "@type": "VirtualLocation", url: `${appBaseUrl}/events/${slug}` },
  };

  return (
    <Container className="py-12 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Free</Badge>
          {isFull ? <Badge>Full — join the waitlist</Badge> : null}
        </div>
        <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {event.title}
        </h1>
        {host ? <p className="mt-2 text-lg text-ink-muted">Hosted by {host.displayName}</p> : null}

        <p className="mt-6 text-ink">{formatRange(start, end)}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
          <Users className="size-4" aria-hidden="true" />
          {isFull
            ? `Full (${event.session.capacity} attendees) — the waitlist auto-promotes as spots free up`
            : `${seatsLeft} of ${event.session.capacity} spots open`}
        </p>

        {event.descriptionMd ? (
          <section aria-labelledby="about-heading" className="mt-10">
            <h2 id="about-heading" className="text-xl font-semibold text-ink">
              About this event
            </h2>
            <p className="mt-3 whitespace-pre-line text-ink-muted">{event.descriptionMd}</p>
          </section>
        ) : null}

        {event.recordingUrl && event.recordingVisibility === "public" ? (
          <section aria-labelledby="recording-heading" className="mt-10">
            <h2 id="recording-heading" className="text-xl font-semibold text-ink">
              Recording
            </h2>
            <a
              href={event.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-primary underline"
            >
              <Video className="size-4" aria-hidden="true" /> Watch the recording
            </a>
          </section>
        ) : null}

        <aside
          aria-label="Register"
          className="mt-10 rounded-[var(--radius-card)] border border-line bg-surface p-6"
        >
          <p className="text-sm text-ink-muted">{isFull ? "This event is full" : "Registration"}</p>
          <p className="mt-1 text-lg font-semibold text-ink">Free — no payment required</p>
          <p className="mt-4 text-xs text-ink-muted">
            Registration is available via the API today; an in-page registration flow is coming
            soon.
          </p>
        </aside>
      </div>
    </Container>
  );
}

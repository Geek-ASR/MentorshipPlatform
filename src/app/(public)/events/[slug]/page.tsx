import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, Globe2, PlayCircle, Video } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { loadPublicEvent } from "@/server/views/events";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Container } from "@/ui/container";
import { formatDuration } from "@/ui/format";
import { LocalTime } from "@/ui/local-time";
import { SafetyMenu } from "@/ui/safety-menu";
import { SeatRegistration } from "@/ui/seat-registration";

type PageParams = { slug: string };

/** Seat counts change as people register; the register panel reads the visitor's own state live. */
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadPublicEvent(await getDb(), slug);
  if (!event) return { title: "Event not found", robots: { index: false, follow: false } };
  return {
    title: event.title,
    description: event.description?.slice(0, 155) ?? "A free live event on Aheadly.",
    alternates: { canonical: `/events/${slug}` },
    robots: { index: true, follow: true },
    openGraph: { type: "website", title: event.title },
  };
}

export default async function EventPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const event = await loadPublicEvent(await getDb(), slug);
  if (!event) notFound();
  const durationMin = Math.round((event.end.getTime() - event.start.getTime()) / 60_000);
  const hostFirstName = event.host.name.split(" ")[0]!;
  const cancelled = event.seat.status === "cancelled";

  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.start.toISOString(),
    endDate: event.end.toISOString(),
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: cancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    isAccessibleForFree: true,
    organizer: { "@type": "Person", name: event.host.name },
    location: { "@type": "VirtualLocation", url: `${appBaseUrl}/events/${slug}` },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="border-b border-line bg-surface">
        <Container className="pt-6 pb-10 md:pt-8 md:pb-14">
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> All events
          </Link>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge tone="accent">Free event</Badge>
            <Badge>Online</Badge>
            {cancelled ? <Badge>Cancelled</Badge> : null}
          </div>
          <h1 className="mt-4 max-w-3xl font-serif text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-[2.6rem]">
            {event.title}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 text-sm">
            <div className="flex items-center gap-3">
              <Avatar name={event.host.name} seed={event.host.userId} size="sm" />
              <div>
                <p className="text-ink-muted">Hosted by</p>
                {event.host.slug ? (
                  <Link
                    href={`/mentors/${event.host.slug}`}
                    className="font-medium text-ink hover:text-primary"
                  >
                    {event.host.name}
                  </Link>
                ) : (
                  <p className="font-medium text-ink">{event.host.name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-ink">
              <CalendarDays className="size-4 text-primary" aria-hidden="true" />
              <LocalTime iso={event.start.toISOString()} format="date" />
            </div>
            <div className="flex items-center gap-2 text-ink">
              <Clock className="size-4 text-primary" aria-hidden="true" />
              <span>
                <LocalTime
                  iso={event.start.toISOString()}
                  endIso={event.end.toISOString()}
                  format="range"
                />{" "}
                <span className="text-ink-muted">({formatDuration(durationMin)})</span>
              </span>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-10 md:py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="order-2 min-w-0 space-y-10 lg:order-1">
            {event.description ? (
              <section aria-labelledby="about-heading">
                <h2 id="about-heading" className="text-xl font-semibold text-ink">
                  About this event
                </h2>
                <p className="mt-3 max-w-prose leading-relaxed whitespace-pre-line text-ink/85">
                  {event.description}
                </p>
              </section>
            ) : null}

            <section aria-labelledby="how-heading">
              <h2 id="how-heading" className="text-xl font-semibold text-ink">
                How it works
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: Globe2,
                    title: "Online and free",
                    body: "No payment, ever. Join from your browser — no app to install.",
                  },
                  {
                    icon: Video,
                    title: "Join link on the day",
                    body: "It appears on your booking page shortly before the start.",
                  },
                  {
                    icon: CalendarDays,
                    title: "Can't make it?",
                    body: "Cancel in one click so someone on the waitlist gets your spot.",
                  },
                ].map((item) => (
                  <li
                    key={item.title}
                    className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                  >
                    <item.icon className="size-5 text-primary" aria-hidden="true" />
                    <p className="mt-3 font-medium text-ink">{item.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
                  </li>
                ))}
              </ul>
            </section>

            {event.recordingUrl ? (
              <section aria-labelledby="recording-heading">
                <h2 id="recording-heading" className="text-xl font-semibold text-ink">
                  Recording
                </h2>
                <a
                  href={event.recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 font-medium text-primary hover:underline"
                >
                  <PlayCircle className="size-5" aria-hidden="true" /> Watch the recording
                </a>
              </section>
            ) : null}

            <section
              aria-labelledby="host-heading"
              className="rounded-[var(--radius-card)] border border-line bg-surface p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id="host-heading"
                  className="text-sm font-medium tracking-wide text-ink-muted uppercase"
                >
                  Your host
                </h2>
                <div className="-my-2 -mr-2">
                  <SafetyMenu
                    report={{ type: "event", id: event.seat.sessionId, label: "this event" }}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <Avatar name={event.host.name} seed={event.host.userId} size="lg" />
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink">{event.host.name}</p>
                  {event.host.headline ? (
                    <p className="text-sm text-ink-muted">{event.host.headline}</p>
                  ) : null}
                </div>
              </div>
              {event.host.slug ? (
                <Link
                  href={`/mentors/${event.host.slug}`}
                  className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
                >
                  See {hostFirstName}&apos;s profile and 1:1 sessions
                </Link>
              ) : null}
            </section>
          </div>

          <aside aria-label="Registration" className="order-1 lg:order-2 lg:-mt-52">
            <div className="lg:sticky lg:top-24">
              <SeatRegistration session={event.seat} returnPath={`/events/${slug}`} />
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}

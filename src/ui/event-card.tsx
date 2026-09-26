import { CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import type { EventTeaser } from "@/server/views/home";
import { Avatar } from "./avatar";
import { cn } from "./cn";
import { formatDate, formatDuration, formatTime, pluralize, zoneLabel } from "./format";
import { LocalTime } from "./local-time";

/**
 * Free event teaser. Seat counts come straight from live bookings (docs/22 §9: urgency text must be
 * literally true). With `timeZone` (signed-in pages) times render server-side in that zone;
 * without it they render in the visitor's browser zone.
 */
export function EventCard({
  event,
  timeZone,
  className,
}: {
  event: EventTeaser;
  timeZone?: string;
  className?: string;
}) {
  const minutes = Math.round((event.end.getTime() - event.start.getTime()) / 60_000);
  const taken = event.capacity - event.seatsLeft;
  const fill = event.capacity > 0 ? Math.min(100, Math.round((taken / event.capacity) * 100)) : 0;
  return (
    <Link
      href={`/events/${event.slug}`}
      className={cn(
        "group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {timeZone ? (
            `${formatDate(event.start, timeZone)} · ${formatTime(event.start, timeZone)} ${zoneLabel(event.start, timeZone)}`
          ) : (
            <LocalTime iso={event.start.toISOString()} />
          )}
        </p>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
          Free
        </span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-base font-semibold text-ink group-hover:text-primary">
        {event.title}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">{formatDuration(minutes)} · live online</p>
      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2.5">
          <Avatar name={event.hostName} seed={event.hostUserId} size="sm" />
          <p className="text-sm text-ink">
            <span className="text-ink-muted">Hosted by </span>
            {event.hostName}
          </p>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              {event.seatsLeft > 0
                ? `${pluralize(event.seatsLeft, "seat")} left`
                : "Full — waitlist open"}
            </span>
            <span className="tabular">
              {taken}/{event.capacity}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="presentation">
            <div className="h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}

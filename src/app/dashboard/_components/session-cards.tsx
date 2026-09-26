import { CalendarPlus, Clock, Users, Video } from "lucide-react";
import Link from "next/link";
import type { SessionCardView } from "@/server/views/sessions";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import {
  formatDate,
  formatDuration,
  formatFromNow,
  formatRelativeDay,
  formatTime,
  formatTimeRange,
  pluralize,
  zoneLabel,
} from "@/ui/format";
import { BookingStatusBadge } from "@/ui/status-badge";

const KIND_LABEL = { one_on_one: "1:1 session", group: "Group session", event: "Free event" };

function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

/** Join is a plain link to the server's checked redirect (docs/09 §12) — active only inside the
 * join window, otherwise the button says when it opens instead of silently doing nothing. */
function JoinButton({
  session,
  now,
  joinWindowMin,
  timeZone,
}: {
  session: SessionCardView;
  now: Date;
  joinWindowMin: number;
  timeZone: string;
}) {
  const opensAt = new Date(session.start.getTime() - joinWindowMin * 60_000);
  const open = session.status === "confirmed" && now >= opensAt && now <= session.end;
  if (open) {
    return (
      <Button asChild>
        <a href={`/api/v1/sessions/${session.sessionId}/join`} target="_blank" rel="noreferrer">
          <Video aria-hidden="true" /> Join now
        </a>
      </Button>
    );
  }
  return (
    <Button disabled variant="secondary" title={`Opens at ${formatTime(opensAt, timeZone)}`}>
      <Video aria-hidden="true" /> Join opens {joinWindowMin} min before
    </Button>
  );
}

export function NextSessionCard({
  session,
  timeZone,
  now,
  joinWindowMin,
  role = "student",
}: {
  session: SessionCardView;
  timeZone: string;
  now: Date;
  joinWindowMin: number;
  role?: "student" | "mentor";
}) {
  const other = session.counterpart;
  const grouped = session.attendeeCount !== undefined;
  const showOtherZone = !grouped && other.timezone !== timeZone;
  return (
    <article
      aria-labelledby={`next-${session.bookingId}`}
      className="relative overflow-hidden rounded-[var(--radius-sheet)] border border-line bg-surface"
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">
            {formatRelativeDay(session.start, timeZone, now)}
          </p>
          <span className="text-sm text-ink-muted">{formatFromNow(session.start, now)}</span>
          <BookingStatusBadge status={session.status} />
        </div>
        <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-ink">
          {formatTimeRange(session.start, session.end, timeZone)}
        </p>
        {showOtherZone ? (
          <p className="tabular mt-1 text-sm text-ink-muted">
            {formatTime(session.start, other.timezone)} {zoneLabel(session.start, other.timezone)}{" "}
            for {other.name.split(" ")[0]}
          </p>
        ) : null}

        <div className="mt-6 flex items-start gap-4">
          {grouped ? (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Users className="size-6" aria-hidden="true" />
            </span>
          ) : (
            <Avatar name={other.name} seed={other.userId} size="lg" />
          )}
          <div className="min-w-0">
            <h3 id={`next-${session.bookingId}`} className="text-lg font-semibold text-ink">
              {session.title}
            </h3>
            {grouped ? (
              <p className="mt-0.5 text-sm text-ink-muted">
                {pluralize(session.attendeeCount!, "person", "people")} registered
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-ink-muted">
                {role === "student" ? "with " : "booked by "}
                {other.slug && role === "student" ? (
                  <Link
                    href={`/mentors/${other.slug}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {other.name}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{other.name}</span>
                )}
                {other.headline && role === "student" ? ` · ${other.headline}` : ""}
              </p>
            )}
            <p className="mt-2 flex items-center gap-3 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden="true" />
                {formatDuration(minutesBetween(session.start, session.end))}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden="true" />
                {KIND_LABEL[session.kind]}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <JoinButton
            session={session}
            now={now}
            joinWindowMin={joinWindowMin}
            timeZone={timeZone}
          />
          <Button asChild variant="secondary">
            <a href={`/api/v1/bookings/${session.bookingId}/calendar.ics`} download>
              <CalendarPlus aria-hidden="true" /> Add to calendar
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}

/** One line per session in a list: date block, title, counterpart, status. */
export function SessionRow({
  session,
  timeZone,
  now,
  role = "student",
  showStatus = true,
}: {
  session: SessionCardView;
  timeZone: string;
  now: Date;
  role?: "student" | "mentor";
  showStatus?: boolean;
}) {
  const day = new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric" }).format(session.start);
  const month = new Intl.DateTimeFormat("en-IN", { timeZone, month: "short" }).format(
    session.start,
  );
  const href =
    session.attendeeCount !== undefined && session.eventSlug
      ? `/events/${session.eventSlug}`
      : `/dashboard/bookings/${session.bookingId}`;
  return (
    <li>
      <Link
        href={href}
        className="group -mx-3 flex items-center gap-4 rounded-[var(--radius-control)] px-3 py-4 transition-colors hover:bg-canvas"
      >
        <div
          aria-hidden="true"
          className="flex size-12 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] border border-line bg-canvas leading-none group-hover:bg-surface"
        >
          <span className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
            {month}
          </span>
          <span className="tabular mt-0.5 text-lg font-semibold text-ink">{day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink group-hover:text-primary">{session.title}</p>
          <p className="tabular truncate text-sm text-ink-muted">
            <span className="sr-only">{formatDate(session.start, timeZone, now)}, </span>
            {formatTimeRange(session.start, session.end, timeZone)} ·{" "}
            {session.attendeeCount !== undefined
              ? `${pluralize(session.attendeeCount, "person", "people")} registered`
              : `${role === "student" ? "with" : "for"} ${session.counterpart.name}`}
          </p>
        </div>
        {showStatus ? (
          <BookingStatusBadge status={session.status} className="hidden sm:inline-flex" />
        ) : null}
      </Link>
    </li>
  );
}

export function SessionList({
  sessions,
  timeZone,
  now,
  role,
  className,
}: {
  sessions: SessionCardView[];
  timeZone: string;
  now: Date;
  role?: "student" | "mentor";
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {sessions.map((session) => (
        <SessionRow
          key={session.bookingId}
          session={session}
          timeZone={timeZone}
          now={now}
          role={role}
        />
      ))}
    </ul>
  );
}

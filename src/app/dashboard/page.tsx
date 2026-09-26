import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Compass,
  Heart,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { getSetting } from "@/server/platform/settings/settings";
import { findMentorStats, getSavedMentorIds } from "@/server/modules/profiles";
import { loadEventTeasers } from "@/server/views/home";
import { loadMentorCards, MIN_REVIEWS_FOR_RATING } from "@/server/views/mentor-cards";
import { loadHostedSessions, loadStudentSessions } from "@/server/views/sessions";
import { requireViewer } from "@/server/views/viewer";
import { Button } from "@/ui/button";
import {
  formatDate,
  formatRelativeDay,
  formatTime,
  greeting,
  pluralize,
  zoneLabel,
} from "@/ui/format";
import { MentorListItem } from "@/ui/mentor-card";
import { PageHeader, SectionHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { NextSessionCard, SessionList } from "./_components/session-cards";
import { VerifyEmailBanner } from "./_components/verify-email-banner";

export const metadata = { title: "Overview" };

/** "today", "tomorrow" or "on Fri, 2 Oct" for a sentence. */
function nextDayPhrase(date: Date, timeZone: string, now: Date): string {
  const label = formatRelativeDay(date, timeZone, now);
  return label === "Today" || label === "Tomorrow" ? label.toLowerCase() : `on ${label}`;
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="tabular text-2xl leading-none font-semibold text-ink">{value}</p>
        <p className="mt-1 text-sm text-ink-muted">{label}</p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const { actor, user } = await requireViewer("/dashboard");
  const db = await getDb();
  const now = new Date();
  const timeZone = user.timezone;
  const isMentor = actor.roles.has("mentor");

  const [mine, hosted, mentorStats, savedIds, events, joinWindowMin] = await Promise.all([
    loadStudentSessions(db, user.id, now),
    isMentor ? loadHostedSessions(db, user.id, now) : Promise.resolve(null),
    isMentor ? findMentorStats(db, user.id) : Promise.resolve(undefined),
    getSavedMentorIds(db, user.id),
    loadEventTeasers(db, now, 3),
    getSetting(db, "join.window_before_min", now),
  ]);
  const saved = await loadMentorCards(db, savedIds.slice(0, 4));

  const [next, ...laterUpcoming] = mine.upcoming;
  const hostedUpcoming = hosted?.upcoming ?? [];
  // A mentor with nothing booked as a student sees their own teaching schedule first.
  const mentorFirst = hostedUpcoming.length > 0 && mine.upcoming.length === 0;
  const [nextHosted, ...laterHosted] = hostedUpcoming;
  const hostingSection =
    hostedUpcoming.length > 0 ? (
      <section aria-labelledby="hosting-heading" className="space-y-4">
        <SectionHeader
          id="hosting-heading"
          title={mentorFirst ? "Up next — you're mentoring" : "You're mentoring"}
          action={
            <span className="text-sm text-ink-muted">
              {pluralize(hostedUpcoming.length, "upcoming session")}
            </span>
          }
        />
        {mentorFirst && nextHosted ? (
          <NextSessionCard
            session={nextHosted}
            timeZone={timeZone}
            now={now}
            joinWindowMin={joinWindowMin}
            role="mentor"
          />
        ) : null}
        {(mentorFirst ? laterHosted : hostedUpcoming).length > 0 ? (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5">
            <SessionList
              sessions={(mentorFirst ? laterHosted : hostedUpcoming).slice(0, 6)}
              timeZone={timeZone}
              now={now}
              role="mentor"
            />
          </div>
        ) : null}
      </section>
    ) : null;
  const completedCount = mine.past.filter((s) => s.status === "completed").length;
  const firstName = user.displayName.split(" ")[0];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={formatDate(now, timeZone, now)}
        title={`${greeting(timeZone, now)}, ${firstName}`}
        description={
          next
            ? `Your next session is ${nextDayPhrase(next.start, timeZone, now)} at ${formatTime(next.start, timeZone)} ${zoneLabel(next.start, timeZone)}.`
            : nextHosted
              ? `Your next mentoring session is ${nextDayPhrase(nextHosted.start, timeZone, now)} at ${formatTime(nextHosted.start, timeZone)} ${zoneLabel(nextHosted.start, timeZone)}.`
              : "Find someone who's been where you're going — or start with a free event."
        }
        actions={
          <Button asChild>
            <Link href="/mentors">
              <Compass aria-hidden="true" /> Find a mentor
            </Link>
          </Button>
        }
      />

      {!user.emailVerified ? <VerifyEmailBanner email={user.email} /> : null}

      {isMentor ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={CalendarDays}
            label="Upcoming mentoring sessions"
            value={hostedUpcoming.length}
          />
          <StatTile
            icon={CalendarCheck2}
            label="Sessions mentored"
            value={mentorStats?.sessionsCompleted ?? 0}
          />
          <StatTile
            icon={Star}
            label={
              mentorStats && mentorStats.reviewCount >= MIN_REVIEWS_FOR_RATING
                ? `Average rating · ${pluralize(mentorStats.reviewCount, "review")}`
                : `Rating shows after ${MIN_REVIEWS_FOR_RATING} reviews`
            }
            value={
              mentorStats &&
              mentorStats.reviewCount >= MIN_REVIEWS_FOR_RATING &&
              mentorStats.avgRating !== null
                ? Number(mentorStats.avgRating).toFixed(1)
                : "New"
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile icon={CalendarDays} label="Upcoming sessions" value={mine.upcoming.length} />
          <StatTile icon={CalendarCheck2} label="Sessions completed" value={completedCount} />
          <StatTile icon={Heart} label="Saved mentors" value={savedIds.length} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          {mentorFirst ? (
            <>
              {hostingSection}
              <p className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm text-ink-muted">
                You haven&apos;t booked any sessions yourself.{" "}
                <Link href="/mentors" className="font-medium text-primary hover:underline">
                  Find a mentor
                </Link>{" "}
                when you want a second opinion of your own.
              </p>
            </>
          ) : (
            <>
              <section aria-labelledby="next-heading">
                <SectionHeader id="next-heading" title="Up next" />
                {next ? (
                  <NextSessionCard
                    session={next}
                    timeZone={timeZone}
                    now={now}
                    joinWindowMin={joinWindowMin}
                  />
                ) : (
                  <EmptyState
                    icon={<CalendarDays className="size-8" aria-hidden="true" />}
                    title="No sessions booked yet"
                    description="Browse mentors by university, company or topic. Every price is shown upfront, and many mentors offer a free intro call."
                    action={
                      <Button asChild>
                        <Link href="/mentors">Explore mentors</Link>
                      </Button>
                    }
                  />
                )}
              </section>

              {laterUpcoming.length > 0 ? (
                <section aria-labelledby="later-heading">
                  <SectionHeader id="later-heading" title="Later" />
                  <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5">
                    <SessionList sessions={laterUpcoming} timeZone={timeZone} now={now} />
                  </div>
                </section>
              ) : null}

              {hostingSection}
            </>
          )}

          {mine.past.length > 0 ? (
            <section aria-labelledby="recent-heading">
              <SectionHeader id="recent-heading" title="Recent sessions" />
              <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5">
                <SessionList sessions={mine.past.slice(0, 4)} timeZone={timeZone} now={now} />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-10" aria-label="For you">
          <section aria-labelledby="saved-heading">
            <SectionHeader id="saved-heading" title="Saved mentors" />
            {saved.length > 0 ? (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <ul className="space-y-1">
                  {saved.map((card) => (
                    <li key={card.userId}>
                      <MentorListItem card={card} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm text-ink-muted">
                Tap the heart on a mentor&apos;s profile to keep them here for later.
              </p>
            )}
          </section>

          <section aria-labelledby="events-heading">
            <SectionHeader
              id="events-heading"
              title="Free events"
              action={
                <Link href="/events" className="text-sm font-medium text-primary hover:underline">
                  See all
                </Link>
              }
            />
            {events.length > 0 ? (
              <ul className="space-y-3">
                {events.map((event) => (
                  <li key={event.slug}>
                    <Link
                      href={`/events/${event.slug}`}
                      className="group block rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-primary/40"
                    >
                      <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                        {formatDate(event.start, timeZone, now)} ·{" "}
                        {formatTime(event.start, timeZone)} {zoneLabel(event.start, timeZone)}
                      </p>
                      <p className="mt-1.5 font-medium text-ink group-hover:text-primary">
                        {event.title}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {event.hostName} ·{" "}
                        {event.seatsLeft > 0
                          ? `${pluralize(event.seatsLeft, "seat")} left`
                          : "Waitlist open"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No free events scheduled right now.</p>
            )}
          </section>

          {!isMentor ? (
            <section className="rounded-[var(--radius-card)] bg-primary p-5 text-on-primary">
              <Sparkles className="size-5" aria-hidden="true" />
              <p className="mt-3 font-semibold">Been there already?</p>
              <p className="mt-1 text-sm text-on-primary/85">
                Share what you learned with students one step behind you — as a paid or volunteer
                mentor.
              </p>
              <Link
                href="/sign-up?intent=mentor"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                Learn about mentoring <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck2,
  Clock,
  MessageSquareText,
  Receipt,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { getSetting } from "@/server/platform/settings/settings";
import { findSchedulingSettings } from "@/server/modules/booking";
import { loadBookingDetail } from "@/server/views/booking-detail";
import { requireViewer } from "@/server/views/viewer";
import { Alert } from "@/ui/alert";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import {
  formatDate,
  formatDuration,
  formatFromNow,
  formatLongDate,
  formatMoney,
  formatTime,
  formatTimeRange,
  zoneLabel,
} from "@/ui/format";
import { BookingStatusBadge } from "@/ui/status-badge";
import { BookingActions } from "./booking-actions";
import { PaymentRefresher } from "./payment-refresher";

export const metadata: Metadata = { title: "Booking" };

const KIND_LABEL = { one_on_one: "1:1 session", group: "Group session", event: "Free event" };

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ booked?: string }>;
}) {
  const { id } = await params;
  const { booked } = await searchParams;
  const { user } = await requireViewer(`/dashboard/bookings/${id}`);
  const db = await getDb();
  const booking = await loadBookingDetail(db, user.id, id);
  if (!booking) notFound();
  const now = new Date();
  const [joinWindowMin, scheduling] = await Promise.all([
    getSetting(db, "join.window_before_min", now),
    findSchedulingSettings(db, booking.mentor.userId),
  ]);

  const timeZone = user.timezone;
  const { session } = booking;
  const other = booking.role === "student" ? booking.mentor : booking.student;
  const otherFirstName = other.name.split(" ")[0]!;
  const upcoming =
    session.end > now && (booking.status === "confirmed" || booking.status === "held");

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/bookings"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All bookings
      </Link>

      {booked && booking.status === "confirmed" ? (
        <Alert tone="success" title="You're booked!" live>
          We&apos;ve emailed the details to you and {otherFirstName}. Add it to your calendar so you
          don&apos;t miss it — the join link opens {joinWindowMin} minutes before the start.
        </Alert>
      ) : null}
      {booking.status === "held" && booking.role === "student" ? (
        <PaymentRefresher bookingId={booking.id} />
      ) : null}
      {booking.status === "held" && booking.role === "student" ? (
        <Alert
          tone="warning"
          title="Waiting for payment"
          action={
            <Button asChild size="sm">
              <Link href={`/checkout/${booking.id}`}>Continue to payment</Link>
            </Button>
          }
        >
          This time is held for you until the hold ends. Nothing is booked until the payment goes
          through.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-[var(--radius-sheet)] border border-line bg-surface p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <BookingStatusBadge status={booking.status} />
              <span className="text-sm text-ink-muted">{KIND_LABEL[session.kind]}</span>
              {upcoming ? (
                <span className="text-sm text-ink-muted">
                  Starts {formatFromNow(session.start, now)}
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink">
              {session.title}
            </h1>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3">
                <CalendarCheck2
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-ink">{formatDate(session.start, timeZone, now)}</p>
                  <p className="tabular text-ink">
                    {formatTimeRange(session.start, session.end, timeZone)}
                  </p>
                  {other.timezone !== timeZone ? (
                    <p className="tabular mt-0.5 text-sm text-ink-muted">
                      {formatTime(session.start, other.timezone)}{" "}
                      {zoneLabel(session.start, other.timezone)} for {otherFirstName}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-medium text-ink">{formatDuration(session.durationMin)}</p>
                  <p className="text-sm text-ink-muted">
                    Online · the join link opens {joinWindowMin} min before
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-7 border-t border-line pt-6">
              <BookingActions
                bookingId={booking.id}
                sessionId={session.id}
                role={booking.role}
                status={booking.status}
                start={session.start.toISOString()}
                end={session.end.toISOString()}
                priceMinor={booking.priceMinor}
                currency={booking.currency}
                timeZone={timeZone}
                joinWindowMin={joinWindowMin}
                otherFirstName={otherFirstName}
                reschedule={
                  session.kind === "one_on_one"
                    ? {
                        mentorSlug: booking.mentor.slug,
                        serviceId: session.serviceId,
                        durationMin: session.durationMin,
                        mentorTimeZone: scheduling?.timezone ?? booking.mentor.timezone,
                        maxAdvanceDays: scheduling?.maxAdvanceDays ?? 30,
                      }
                    : null
                }
                pendingRequest={
                  booking.pendingReschedule
                    ? {
                        id: booking.pendingReschedule.id,
                        requestedBy: booking.pendingReschedule.requestedBy,
                        start: booking.pendingReschedule.start.toISOString(),
                      }
                    : null
                }
              />
            </div>
          </section>

          {booking.intakeAnswers.length > 0 ? (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <h2 className="flex items-center gap-2 font-semibold text-ink">
                <MessageSquareText className="size-4 text-ink-muted" aria-hidden="true" />
                {booking.role === "student" ? "What you shared" : `What ${otherFirstName} shared`}
              </h2>
              <ul className="mt-3 space-y-3 text-sm">
                {booking.intakeAnswers.map((answer) => (
                  <li key={answer.questionId} className="whitespace-pre-line text-ink/90">
                    {answer.value}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="text-sm font-medium tracking-wide text-ink-muted uppercase">
              {booking.role === "student" ? "Your mentor" : "Booked by"}
            </h2>
            <div className="mt-3 flex items-center gap-3">
              {session.kind === "one_on_one" || booking.role === "student" ? (
                <Avatar name={other.name} seed={other.userId} size="md" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Users className="size-5" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                {other.slug && booking.role === "student" ? (
                  <Link
                    href={`/mentors/${other.slug}`}
                    className="font-semibold text-ink hover:text-primary"
                  >
                    {other.name}
                  </Link>
                ) : (
                  <p className="font-semibold text-ink">{other.name}</p>
                )}
                {other.headline && booking.role === "student" ? (
                  <p className="truncate text-sm text-ink-muted">{other.headline}</p>
                ) : null}
              </div>
            </div>
          </section>

          {booking.role === "student" ? (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-ink-muted uppercase">
                <Receipt className="size-4" aria-hidden="true" /> Payment
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Price</dt>
                  <dd className="tabular font-medium text-ink">
                    {formatMoney(booking.priceMinor, booking.currency)}
                  </dd>
                </div>
                {booking.payment ? (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Paid</dt>
                      <dd className="text-ink">
                        {formatLongDate(booking.payment.paidAt, timeZone)}
                      </dd>
                    </div>
                    {booking.payment.refundedMinor > 0 ? (
                      <div className="flex justify-between">
                        <dt className="text-ink-muted">Refunded</dt>
                        <dd className="tabular font-medium text-success">
                          {formatMoney(booking.payment.refundedMinor, booking.payment.currency)}
                        </dd>
                      </div>
                    ) : null}
                  </>
                ) : booking.priceMinor > 0 && booking.status !== "held" ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Payment</dt>
                    <dd className="text-ink">Not taken</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 text-xs text-ink-muted">
                Reference {booking.id.slice(-8).toUpperCase()}
              </p>
            </section>
          ) : null}

          {booking.policy && booking.role === "student" && booking.priceMinor > 0 ? (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5 text-sm">
              <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-ink-muted uppercase">
                <ShieldCheck className="size-4" aria-hidden="true" /> Cancellation terms
              </h2>
              <ul className="mt-3 space-y-2 text-ink/90">
                <li>
                  Full refund until{" "}
                  {formatDate(
                    new Date(session.start.getTime() - booking.policy.fullRefundHours * 3_600_000),
                    timeZone,
                    now,
                  )}
                  ,{" "}
                  {formatTime(
                    new Date(session.start.getTime() - booking.policy.fullRefundHours * 3_600_000),
                    timeZone,
                  )}
                </li>
                <li>
                  {booking.policy.partialRefundPct}% back until{" "}
                  {formatTime(
                    new Date(
                      session.start.getTime() - booking.policy.partialRefundHours * 3_600_000,
                    ),
                    timeZone,
                  )}{" "}
                  on{" "}
                  {formatDate(
                    new Date(
                      session.start.getTime() - booking.policy.partialRefundHours * 3_600_000,
                    ),
                    timeZone,
                    now,
                  )}
                </li>
                <li>If your mentor cancels or doesn&apos;t show up, you get everything back.</li>
              </ul>
              <p className="mt-3 text-xs text-ink-muted">These are the terms you booked under.</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

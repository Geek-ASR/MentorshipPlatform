import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarCheck2, Clock, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { getEnv } from "@/config/env";
import { getDb } from "@/server/platform/db/client";
import { loadBookingDetail } from "@/server/views/booking-detail";
import { requireViewer } from "@/server/views/viewer";
import { Avatar } from "@/ui/avatar";
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatTime,
  formatTimeRange,
  zoneLabel,
} from "@/ui/format";
import { Logo } from "@/ui/logo";
import { CheckoutPanel } from "./checkout-panel";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/** docs/22 §3 J1 step 4: the paid half of booking — the hold, the total, and the payment. */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireViewer(`/checkout/${id}`);
  const booking = await loadBookingDetail(await getDb(), user.id, id);
  if (!booking || booking.role !== "student") notFound();
  if (booking.status === "confirmed" || booking.confirmedAt) redirect(`/dashboard/bookings/${id}`);
  if (booking.status !== "held" || !booking.checkout) redirect(`/dashboard/bookings/${id}`);

  const timeZone = user.timezone;
  const { session, mentor } = booking;
  const amountLabel = formatMoney(booking.priceMinor, booking.currency);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={`${brand.name} home`} className="rounded-md">
            <Logo />
          </Link>
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Lock className="size-4" aria-hidden="true" /> Checkout
          </p>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <section aria-labelledby="pay-heading" className="order-2 lg:order-1">
          <h1
            id="pay-heading"
            className="font-serif text-3xl font-semibold tracking-tight text-ink"
          >
            Confirm and pay
          </h1>
          <p className="mt-2 text-ink-muted">
            Your session is confirmed the moment the payment goes through.
          </p>
          <div className="mt-8 rounded-[var(--radius-sheet)] border border-line bg-surface p-6">
            <CheckoutPanel
              bookingId={booking.id}
              providerOrderId={booking.checkout.providerOrderId}
              amountLabel={amountLabel}
              holdExpiresAt={
                (booking.checkout.holdExpiresAt ?? booking.holdExpiresAt)?.toISOString() ?? null
              }
              mentorSlug={mentor.slug}
              provider={getEnv().PAYMENTS_PROVIDER}
            />
          </div>
          {booking.policy ? (
            <div className="mt-6 flex items-start gap-3 text-sm text-ink-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p>
                Cancel up to {booking.policy.fullRefundHours} hours before for a full refund, or up
                to {booking.policy.partialRefundHours} hours before for{" "}
                {booking.policy.partialRefundPct}% back. If {mentor.name.split(" ")[0]} cancels or
                doesn&apos;t show up, you get everything back.{" "}
                <Link
                  href="/legal/refund-cancellation"
                  className="font-medium text-primary hover:underline"
                >
                  Full policy
                </Link>
              </p>
            </div>
          ) : null}
        </section>

        <aside
          aria-labelledby="summary-heading"
          className="order-1 h-fit rounded-[var(--radius-sheet)] border border-line bg-surface p-6 lg:order-2"
        >
          <h2
            id="summary-heading"
            className="text-sm font-medium tracking-wide text-ink-muted uppercase"
          >
            Your session
          </h2>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={mentor.name} seed={mentor.userId} size="md" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{session.title}</p>
              <p className="truncate text-sm text-ink-muted">with {mentor.name}</p>
            </div>
          </div>
          <ul className="mt-5 space-y-3 text-sm">
            <li className="flex gap-3">
              <CalendarCheck2
                className="mt-0.5 size-4 shrink-0 text-ink-muted"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium text-ink">
                  {formatDate(session.start, timeZone)} ·{" "}
                  <span className="tabular">
                    {formatTimeRange(session.start, session.end, timeZone)}
                  </span>
                </p>
                {mentor.timezone !== timeZone ? (
                  <p className="tabular text-xs text-ink-muted">
                    {formatTime(session.start, mentor.timezone)}{" "}
                    {zoneLabel(session.start, mentor.timezone)} for {mentor.name.split(" ")[0]}
                  </p>
                ) : null}
              </div>
            </li>
            <li className="flex gap-3">
              <Clock className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <p className="text-ink">{formatDuration(session.durationMin)}, online</p>
            </li>
          </ul>
          <dl className="mt-5 space-y-2 border-t border-line pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Session</dt>
              <dd className="tabular text-ink">{amountLabel}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Fees</dt>
              <dd className="text-ink">None</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="tabular font-semibold text-ink">{amountLabel}</dd>
            </div>
          </dl>
        </aside>
      </main>
    </div>
  );
}

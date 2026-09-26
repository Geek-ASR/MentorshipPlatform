"use client";

import { CalendarCheck2, Clock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { formatDate, formatDuration, formatMoney, formatTime, zoneLabel } from "@/ui/format";
import { Textarea } from "@/ui/input";
import { SlotPicker } from "@/ui/slot-picker";
import { useBrowserTimeZone } from "@/ui/use-hydrated";
import { useViewer } from "@/ui/viewer";

export type BookableService = {
  id: string;
  title: string;
  description: string | null;
  prices: { durationMin: number; priceMinor: number; currency: string }[];
  intakeQuestions: { id: string; label: string }[];
};

type CreateBookingResponse = {
  booking: { id: string; status: string };
  isFree: boolean;
  checkout: { providerOrderId: string } | null;
};

function fromPrice(service: BookableService) {
  return [...service.prices].sort((a, b) => a.priceMinor - b.priceMinor)[0];
}

/**
 * The booking sheet (docs/22 §3 J1 step 3): service → duration → date and time in the viewer's
 * zone → optional intake answers → the full price and cancellation terms before committing. The
 * price shown is the total — there are no fees added at checkout (docs/22 §9).
 */
export function BookingPanel({
  mentor,
  services,
  maxAdvanceDays,
  policy,
}: {
  mentor: { userId: string; slug: string; firstName: string; timezone: string };
  services: BookableService[];
  maxAdvanceDays: number;
  policy: { fullRefundHours: number; partialRefundHours: number; partialRefundPct: number };
}) {
  const router = useRouter();
  const viewerState = useViewer();
  const viewer = viewerState.status === "ready" ? viewerState.viewer : null;
  const browserZone = useBrowserTimeZone("Asia/Kolkata");
  const timeZone = viewer?.timezone ?? browserZone;

  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const service = services.find((s) => s.id === serviceId) ?? services[0];
  const [durationChoice, setDurationChoice] = useState<number | null>(null);
  const durations = service
    ? [...service.prices].sort((a, b) => a.durationMin - b.durationMin)
    : [];
  const price =
    durations.find((p) => p.durationMin === durationChoice) ??
    (service ? fromPrice(service) : undefined);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<{ start: string; end: string }[]>([]);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    api<{ bookings: { status: string; startsAt: string; endsAt: string }[] }>("/api/v1/me/bookings")
      .then((data) => {
        if (cancelled) return;
        setBusy(
          data.bookings
            .filter((b) => b.status === "held" || b.status === "confirmed")
            .map((b) => ({ start: b.startsAt, end: b.endsAt })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [viewer]);

  if (!service || !price) {
    return (
      <p className="text-sm text-ink-muted">
        {mentor.firstName} hasn&apos;t opened bookings yet. Check back soon.
      </p>
    );
  }

  const isOwnProfile = viewer?.id === mentor.userId;
  const start = startsAt ? new Date(startsAt) : null;
  const end = start ? new Date(start.getTime() + price.durationMin * 60_000) : null;
  const free = price.priceMinor === 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!startsAt || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await api<CreateBookingResponse>("/api/v1/bookings", {
        method: "POST",
        body: {
          mentorUserId: mentor.userId,
          serviceId: service!.id,
          durationMin: price!.durationMin,
          startsAt,
          intakeAnswers: service!.intakeQuestions
            .map((q) => ({ questionId: q.id, value: (answers[q.id] ?? "").trim() }))
            .filter((a) => a.value.length > 0),
        },
      });
      router.push(
        result.isFree
          ? `/dashboard/bookings/${result.booking.id}?booked=1`
          : `/checkout/${result.booking.id}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "SLOT_UNAVAILABLE") {
        setError(
          "Someone just booked that time. Here are the latest openings — please pick another.",
        );
        setStartsAt(null);
        setRefreshKey((k) => k + 1);
      } else {
        setError(errorMessage(err));
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {services.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Session type</legend>
          <div className="space-y-2">
            {services.map((option) => {
              const cheapest = fromPrice(option)!;
              const checked = option.id === service.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-3 transition-colors",
                    checked
                      ? "border-primary bg-primary-soft/50"
                      : "border-line hover:border-primary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="service"
                    value={option.id}
                    checked={checked}
                    onChange={() => {
                      setServiceId(option.id);
                      setDurationChoice(null);
                      setStartsAt(null);
                    }}
                    className="mt-1 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{option.title}</span>
                    <span className="block text-xs text-ink-muted">
                      {cheapest.priceMinor === 0
                        ? "Free"
                        : `From ${formatMoney(cheapest.priceMinor, cheapest.currency)}`}{" "}
                      · {option.prices.map((p) => formatDuration(p.durationMin)).join(" / ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {durations.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Length</legend>
          <div className="flex flex-wrap gap-2">
            {durations.map((option) => {
              const selected = option.durationMin === price.durationMin;
              return (
                <button
                  key={option.durationMin}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setDurationChoice(option.durationMin);
                    setStartsAt(null);
                  }}
                  className={cn(
                    "rounded-[var(--radius-control)] border px-3 py-2 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary text-on-primary"
                      : "border-line bg-surface text-ink hover:border-primary/50",
                  )}
                >
                  {formatDuration(option.durationMin)} ·{" "}
                  <span className="tabular font-semibold">
                    {formatMoney(option.priceMinor, option.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <SlotPicker
        slug={mentor.slug}
        serviceId={service.id}
        durationMin={price.durationMin}
        timeZone={timeZone}
        mentorTimeZone={mentor.timezone}
        mentorFirstName={mentor.firstName}
        maxAdvanceDays={maxAdvanceDays}
        value={startsAt}
        onChange={setStartsAt}
        refreshKey={refreshKey}
        busy={busy}
      />

      {start && service.intakeQuestions.length > 0 ? (
        <div className="space-y-4">
          {service.intakeQuestions.map((question) => (
            <div key={question.id}>
              <label
                htmlFor={`intake-${question.id}`}
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                {question.label} <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <Textarea
                id={`intake-${question.id}`}
                rows={3}
                maxLength={2000}
                value={answers[question.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [question.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : null}

      {start && end ? (
        <div className="rounded-[var(--radius-control)] border border-line bg-canvas p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-ink">
            <CalendarCheck2 className="size-4 text-primary" aria-hidden="true" />
            {formatDate(start, timeZone)}, {formatTime(start, timeZone)} –{" "}
            {formatTime(end, timeZone)} {zoneLabel(start, timeZone)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-ink-muted">
            <Clock className="size-4" aria-hidden="true" />
            {service.title} · {formatDuration(price.durationMin)}
          </p>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-ink-muted">Total</span>
            <span className="tabular text-lg font-semibold text-ink">
              {free ? "Free" : formatMoney(price.priceMinor, price.currency)}
            </span>
          </div>
          {!free ? (
            <p className="mt-1 text-xs text-ink-muted">No fees are added at checkout.</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {viewerState.status === "ready" && !viewer ? (
        <Button asChild size="lg" className="w-full">
          <Link href={`/sign-in?returnTo=${encodeURIComponent(`/mentors/${mentor.slug}`)}`}>
            Sign in to book
          </Link>
        </Button>
      ) : viewer && !viewer.emailVerified ? (
        <div className="space-y-2">
          <Button size="lg" className="w-full" disabled>
            Verify your email to book
          </Button>
          <p className="text-center text-xs text-ink-muted">
            We sent you a link.{" "}
            <Link href="/dashboard" className="font-medium text-primary hover:underline">
              Resend it from your dashboard
            </Link>
          </p>
        </div>
      ) : isOwnProfile ? (
        <Button size="lg" className="w-full" disabled>
          This is your own profile
        </Button>
      ) : (
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!startsAt}
          loading={submitting}
        >
          {!startsAt
            ? "Choose a time to continue"
            : free
              ? "Book free session"
              : `Continue to payment · ${formatMoney(price.priceMinor, price.currency)}`}
        </Button>
      )}

      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Free cancellation up to {policy.fullRefundHours} hours before; {policy.partialRefundPct}%
          back up to {policy.partialRefundHours} hours before.{" "}
          <Link href="/legal/refund-cancellation" className="underline-offset-2 hover:underline">
            Full policy
          </Link>
        </span>
      </p>
    </form>
  );
}

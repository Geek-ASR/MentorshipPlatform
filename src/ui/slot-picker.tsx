"use client";

import { ChevronLeft, ChevronRight, CalendarX2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api, errorMessage } from "./api";
import { Button } from "./button";
import { cn } from "./cn";
import { formatTime, zoneLabel } from "./format";
import { Skeleton } from "./skeleton";

type Slot = { startsAt: string; endsAt: string };

const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayParts(date: Date, timeZone: string) {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-IN", { timeZone, ...options }).format(date);
  return {
    weekday: format({ weekday: "short" }),
    day: format({ day: "numeric" }),
    month: format({ month: "short" }),
    long: format({ weekday: "long", day: "numeric", month: "long" }),
  };
}

/**
 * Date strip + time chips (docs/22 §3 J1 step 3, §8): the next two weeks with a dot on every day
 * that has openings, then that day's start times in the viewer's zone, the mentor's own time
 * alongside. Slots are advisory — the booking transaction re-checks everything (docs/09 §4).
 * Arrow keys move along the date strip and between times.
 */
export function SlotPicker({
  slug,
  serviceId,
  durationMin,
  timeZone,
  mentorTimeZone,
  mentorFirstName,
  maxAdvanceDays,
  value,
  onChange,
  refreshKey = 0,
  label = "Choose a time",
  busy = [],
}: {
  slug: string;
  serviceId: string;
  durationMin: number;
  timeZone: string;
  mentorTimeZone: string;
  mentorFirstName: string;
  maxAdvanceDays: number;
  value: string | null;
  onChange: (startsAt: string | null) => void;
  /** Bump to refetch, e.g. after a slot was taken by someone else. */
  refreshKey?: number;
  label?: string;
  /** The viewer's own held/confirmed sessions — clashing times are shown but can't be picked. */
  busy?: { start: string; end: string }[];
}) {
  const [now] = useState(() => new Date());
  const [page, setPage] = useState(0);
  const maxPages = Math.max(1, Math.ceil(maxAdvanceDays / WINDOW_DAYS));
  const from = useMemo(() => new Date(now.getTime() + page * WINDOW_DAYS * DAY_MS), [now, page]);
  const to = useMemo(() => new Date(from.getTime() + WINDOW_DAYS * DAY_MS), [from]);
  const requestKey = `${serviceId}:${durationMin}:${from.toISOString()}:${refreshKey}`;
  const [result, setResult] = useState<{ key: string; slots: Slot[]; error: string | null } | null>(
    null,
  );
  const loading = result?.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({
      serviceId,
      durationMin: String(durationMin),
      from: from.toISOString(),
      to: to.toISOString(),
    });
    api<{ slots: Slot[] }>(`/api/v1/mentors/${encodeURIComponent(slug)}/slots?${query}`)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, slots: data.slots, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: requestKey, slots: [], error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, durationMin, from, to, requestKey]);

  const days = useMemo(() => {
    const byDay = new Map<string, Slot[]>();
    for (const slot of loading ? [] : (result?.slots ?? [])) {
      const key = dayKey(new Date(slot.startsAt), timeZone);
      byDay.set(key, [...(byDay.get(key) ?? []), slot]);
    }
    const list: { key: string; date: Date; slots: Slot[] }[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const date = new Date(from.getTime() + i * DAY_MS);
      const key = dayKey(date, timeZone);
      if (list.some((d) => d.key === key)) continue;
      list.push({ key, date, slots: byDay.get(key) ?? [] });
    }
    return list;
  }, [from, loading, result, timeZone]);

  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const firstOpenDay = days.find((d) => d.slots.length > 0)?.key ?? null;
  const selectedDayKey =
    chosenDay && days.some((d) => d.key === chosenDay && d.slots.length > 0)
      ? chosenDay
      : value
        ? dayKey(new Date(value), timeZone)
        : firstOpenDay;
  const selectedDay = days.find((d) => d.key === selectedDayKey) ?? null;
  const selectedSlot = value ? new Date(value) : null;

  const dayRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const onDayKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    for (let i = index + step; i >= 0 && i < days.length; i += step) {
      if (days[i]!.slots.length > 0) {
        dayRefs.current.get(days[i]!.key)?.focus();
        return;
      }
    }
  };

  const openDays = days.filter((d) => d.slots.length > 0).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Earlier dates"
            className="flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(maxPages - 1, p + 1))}
            disabled={page >= maxPages - 1}
            aria-label="Later dates"
            className="flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Dates"
        className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
      >
        {loading
          ? Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-[4.25rem] w-14 shrink-0" />
            ))
          : days.map((day, index) => {
              const parts = dayParts(day.date, timeZone);
              const open = day.slots.length > 0;
              const selected = day.key === selectedDayKey;
              return (
                <button
                  key={day.key}
                  ref={(el) => {
                    if (el) dayRefs.current.set(day.key, el);
                    else dayRefs.current.delete(day.key);
                  }}
                  type="button"
                  disabled={!open}
                  aria-pressed={selected}
                  aria-label={`${parts.long}, ${open ? `${day.slots.length} ${day.slots.length === 1 ? "time" : "times"} available` : "no openings"}`}
                  tabIndex={selected || (!selectedDayKey && index === 0) ? 0 : -1}
                  onKeyDown={(event) => onDayKeyDown(event, index)}
                  onClick={() => {
                    setChosenDay(day.key);
                    onChange(null);
                  }}
                  className={cn(
                    "flex w-14 shrink-0 flex-col items-center rounded-[var(--radius-control)] border py-2 text-center transition-colors",
                    selected
                      ? "border-primary bg-primary text-on-primary"
                      : open
                        ? "border-line bg-surface text-ink hover:border-primary/50"
                        : "border-transparent bg-transparent text-ink-muted/60",
                  )}
                >
                  <span className="text-[11px] font-medium uppercase">{parts.weekday}</span>
                  <span className="tabular text-lg leading-tight font-semibold">{parts.day}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 size-1.5 rounded-full",
                      open ? (selected ? "bg-on-primary" : "bg-success") : "bg-transparent",
                    )}
                  />
                </button>
              );
            })}
      </div>

      <div className="mt-3 min-h-24" aria-live="polite">
        {loading ? (
          <div aria-hidden="true" className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : result?.error ? (
          <p className="text-sm text-danger">{result.error}</p>
        ) : openDays === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--radius-control)] border border-dashed border-line px-4 py-6 text-center">
            <CalendarX2 className="size-6 text-ink-muted" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-ink">No openings in these two weeks</p>
            {page < maxPages - 1 ? (
              <Button
                variant="link"
                size="sm"
                className="mt-1"
                onClick={() => setPage((p) => p + 1)}
              >
                Check the next two weeks
              </Button>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">
                Check back soon — mentors add new times.
              </p>
            )}
          </div>
        ) : selectedDay ? (
          <>
            <p className="text-xs text-ink-muted">
              {dayParts(selectedDay.date, timeZone).long} · times in{" "}
              {zoneLabel(selectedDay.date, timeZone)}
            </p>
            <div role="group" aria-label="Start times" className="mt-2 grid grid-cols-3 gap-2">
              {selectedDay.slots.map((slot) => {
                const start = new Date(slot.startsAt);
                const end = new Date(slot.endsAt);
                const selected = selectedSlot?.getTime() === start.getTime();
                const clash = busy.some((b) => new Date(b.start) < end && new Date(b.end) > start);
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    aria-pressed={selected}
                    disabled={clash}
                    aria-label={`${dayParts(start, timeZone).long}, ${formatTime(start, timeZone)} ${zoneLabel(start, timeZone)}, ${clash ? "clashes with one of your bookings" : "available"}`}
                    title={clash ? "You already have a session at this time" : undefined}
                    onClick={() => onChange(selected ? null : slot.startsAt)}
                    className={cn(
                      "tabular h-10 rounded-[var(--radius-control)] border text-sm font-medium transition-colors",
                      selected
                        ? "border-primary bg-primary text-on-primary"
                        : clash
                          ? "cursor-not-allowed border-dashed border-line bg-transparent text-ink-muted/70 line-through"
                          : "border-line bg-surface text-ink hover:border-primary/50 hover:bg-primary-soft/40",
                    )}
                  >
                    {formatTime(start, timeZone)}
                  </button>
                );
              })}
            </div>
            {selectedSlot && mentorTimeZone !== timeZone ? (
              <p className="tabular mt-3 text-xs text-ink-muted">
                That&apos;s {formatTime(selectedSlot, mentorTimeZone)}{" "}
                {zoneLabel(selectedSlot, mentorTimeZone)} for {mentorFirstName}.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

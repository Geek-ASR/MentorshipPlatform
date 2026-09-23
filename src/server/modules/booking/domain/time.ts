import { Temporal } from "@js-temporal/polyfill";

/**
 * All wall-clock <-> instant conversion goes through this file (docs/09 §3.1). Domain code never
 * reads the live system clock directly — every function here is a pure conversion.
 */

export type LocalDate = { year: number; month: number; day: number };
export type LocalTime = { hour: number; minute: number };
export type Disambiguation = "compatible" | "earlier" | "later";

function toDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

/**
 * Converts a mentor-local wall-clock date+time to a UTC instant.
 * `disambiguation`: 'compatible' pushes a skipped spring-forward time forward past the gap (docs/09
 * §3.1 rule 3); 'earlier'/'later' pick a side of a repeated fall-back time.
 */
export function toInstant(
  date: LocalDate,
  time: LocalTime,
  timeZone: string,
  disambiguation: Disambiguation = "compatible",
): Date {
  const zdt = Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time.hour,
      minute: time.minute,
    },
    { disambiguation },
  );
  return toDate(zdt.toInstant());
}

export type ZonedParts = LocalDate & LocalTime & { weekday: number; offsetMinutes: number };

/** Decomposes a UTC instant into its wall-clock parts in `timeZone`. `weekday` is ISO 1 (Mon)–7 (Sun). */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const zdt = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timeZone,
  );
  return {
    year: zdt.year,
    month: zdt.month,
    day: zdt.day,
    hour: zdt.hour,
    minute: zdt.minute,
    weekday: zdt.dayOfWeek,
    offsetMinutes: zdt.offsetNanoseconds / 60_000_000_000,
  };
}

/** `YYYY-MM-DD` in `timeZone`, used to group sessions by the mentor's local calendar date. */
export function localDateKey(instant: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(instant, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function diffMinutes(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 60_000;
}

/** Iterates each local calendar date whose [00:00, 24:00) window overlaps [from, to) in `timeZone`. */
export function* localDatesOverlapping(
  from: Date,
  to: Date,
  timeZone: string,
): Generator<LocalDate> {
  if (from >= to) return;
  // ±1 day guards against zone spread (docs/09 §4): a UTC instant can land on a different local
  // date depending on offset, so widen by a day on each side before walking forward.
  const startZdt = Temporal.Instant.fromEpochMilliseconds(from.getTime() - 86_400_000)
    .toZonedDateTimeISO(timeZone)
    .startOfDay();
  const endInstant = Temporal.Instant.fromEpochMilliseconds(to.getTime() + 86_400_000);
  let cursor = startZdt;
  let guard = 0;
  while (Temporal.ZonedDateTime.compare(cursor, endInstant.toZonedDateTimeISO(timeZone)) < 0) {
    if (guard++ > 400) throw new Error("localDatesOverlapping: iteration guard exceeded");
    yield { year: cursor.year, month: cursor.month, day: cursor.day };
    cursor = cursor.add({ days: 1 });
  }
}

/** `YYYY-MM-DD` for a pure calendar date (no time zone involved — the date is already local). */
export function localDateToKey(date: LocalDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** ISO weekday (1 Mon – 7 Sun) of a pure calendar date, independent of any time zone. */
export function weekdayOfLocalDate(date: LocalDate): number {
  return Temporal.PlainDate.from({ year: date.year, month: date.month, day: date.day }).dayOfWeek;
}

/** True IANA validity check (throws on bogus zone names rather than silently defaulting). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    Temporal.ZonedDateTime.from({ timeZone, year: 2026, month: 1, day: 1 });
    return true;
  } catch {
    return false;
  }
}

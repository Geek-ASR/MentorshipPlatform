/**
 * Display formatting shared by server and client components (docs/22 §1 "time clarity", §6.2
 * tabular numerals). Pure functions over `Intl` only — safe to import from either side.
 *
 * Times use `en-IN` (12-hour, "2:30 pm") because most viewers are students in India; every time is
 * shown with an explicit zone label.
 */

const LOCALE = "en-IN";

/** "₹1,500", "€12.50"; zero is "Free" unless `zeroAsFree` is false. */
export function formatMoney(
  minor: number,
  currency: string,
  { zeroAsFree = true }: { zeroAsFree?: boolean } = {},
): string {
  if (minor === 0 && zeroAsFree) return "Free";
  const major = minor / 100;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/** Short zone label for `timeZone` at `date`: "IST", "CEST", "UTC" — falling back to "GMT+2". */
export function zoneLabel(date: Date, timeZone: string): string {
  let fallback = "";
  for (const locale of ["en-IN", "en-GB", "en-US"]) {
    const label =
      new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? "";
    if (label && !label.startsWith("GMT")) return label;
    fallback ||= label;
  }
  return fallback || timeZone;
}

/** "2:30 pm" */
export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "numeric", minute: "2-digit" }).format(
    date,
  );
}

/** "2:30 – 3:30 pm IST" */
export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  return `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)} ${zoneLabel(start, timeZone)}`;
}

/** "Fri, 2 Oct" (adds the year when it differs from `now`'s). */
export function formatDate(date: Date, timeZone: string, now: Date = new Date()): string {
  const sameYear =
    new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(date) ===
    new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(now);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

/** "2 Oct 2026" — for dates where the weekday adds nothing (joined, verified, published). */
export function formatLongDate(date: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** "March 2026" — verification badges say what was checked and when (docs/22 §1). */
export function formatMonthYear(date: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, month: "long", year: "numeric" }).format(
    date,
  );
}

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "Today", "Tomorrow", or "Fri, 2 Oct". */
export function formatRelativeDay(date: Date, timeZone: string, now: Date = new Date()): string {
  const target = dayKey(date, timeZone);
  if (target === dayKey(now, timeZone)) return "Today";
  if (target === dayKey(new Date(now.getTime() + 86_400_000), timeZone)) return "Tomorrow";
  return formatDate(date, timeZone, now);
}

/** "in 3 days", "in 2 hours", "5 minutes ago" — coarse, for secondary text only. */
export function formatFromNow(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(0, "minute");
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Ananya Iyer" → "AI"; single names give one letter. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

/** Stable identity tone (1–6) so the same person always gets the same avatar colour. */
export function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `tone-${(hash % 6) + 1}`;
}

/** Greeting by the viewer's local hour. */
export function greeting(timeZone: string, now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

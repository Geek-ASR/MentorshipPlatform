"use client";

import { formatDate, formatTime, formatTimeRange, zoneLabel } from "./format";
import { useBrowserTimeZone } from "./use-hydrated";

/** Most visitors are in India; the server renders this zone, then the browser re-renders in its own. */
const DEFAULT_ZONE = "Asia/Kolkata";

/**
 * A time on a statically rendered public page, shown in the visitor's own zone (docs/22 §1 "time
 * clarity"). Server HTML and hydration use a fixed zone so they always match; the browser's zone
 * takes over right after, always with an explicit zone label.
 */
export function LocalTime({
  iso,
  endIso,
  format = "datetime",
}: {
  iso: string;
  endIso?: string;
  format?: "datetime" | "date" | "time" | "range";
}) {
  const zone = useBrowserTimeZone(DEFAULT_ZONE);
  const start = new Date(iso);
  let text: string;
  if (format === "date") text = formatDate(start, zone);
  else if (format === "time") text = `${formatTime(start, zone)} ${zoneLabel(start, zone)}`;
  else if (format === "range" && endIso) text = formatTimeRange(start, new Date(endIso), zone);
  else text = `${formatDate(start, zone)} · ${formatTime(start, zone)} ${zoneLabel(start, zone)}`;

  return (
    <time dateTime={iso} className="tabular">
      {text}
    </time>
  );
}

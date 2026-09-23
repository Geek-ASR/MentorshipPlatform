import { brand } from "@/config/brand";
import type { Database } from "@/server/platform/db/client";
import { getBookingForUser } from "./booking";
import { countSelfServiceReschedules } from "../infra/reschedule-repo";

/**
 * Hand-written RFC 5545 generation (docs/09 §13) — the fixed field set here doesn't warrant a
 * dependency. Never includes another participant's email (privacy); `LOCATION`/`DESCRIPTION` only
 * ever carry the app's own join redirect, never a raw meeting link (docs/09 §12).
 */
const ICS_DOMAIN = brand.supportEmail.split("@")[1] ?? "aheadly.invalid";

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines >75 octets are folded with CRLF + a leading space.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export type BookingIcsInput = {
  bookingId: string;
  start: Date;
  end: Date;
  sequence: number;
  status: "CONFIRMED" | "CANCELLED";
  summary: string;
  joinUrl: string;
  policyUrl: string;
  generatedAt: Date;
};

export function generateBookingIcs(input: BookingIcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${brand.name}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    `METHOD:${input.status === "CANCELLED" ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:booking-${input.bookingId}@${ICS_DOMAIN}`,
    `DTSTAMP:${toIcsUtc(input.generatedAt)}`,
    `DTSTART:${toIcsUtc(input.start)}`,
    `DTEND:${toIcsUtc(input.end)}`,
    `SEQUENCE:${input.sequence}`,
    `STATUS:${input.status}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(`Join: ${input.joinUrl}\\nCancellation policy: ${input.policyUrl}`)}`,
    `LOCATION:${escapeText(input.joinUrl)}`,
    `ORGANIZER:mailto:${brand.supportEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

const CANCELLED_STATUSES = new Set([
  "cancelled_by_student",
  "cancelled_by_mentor",
  "cancelled_by_admin",
  "cancelled_system",
]);

/** Assembles and renders the `.ics` file for one participant's own booking (docs/09 §13). */
export async function getBookingIcsContent(
  db: Database,
  userId: string,
  bookingId: string,
  appBaseUrl: string,
  now: Date,
): Promise<string> {
  const booking = await getBookingForUser(db, userId, bookingId);
  // Counts every accepted reschedule regardless of who requested it — RFC 5545 SEQUENCE just needs
  // to increase monotonically each time the event's time changes.
  const sequence = await countSelfServiceReschedules(db, bookingId);
  return generateBookingIcs({
    bookingId: booking.id,
    start: booking.start,
    end: booking.end,
    sequence,
    status: CANCELLED_STATUSES.has(booking.status) ? "CANCELLED" : "CONFIRMED",
    summary: `${brand.name} mentorship session`,
    joinUrl: `${appBaseUrl}/sessions/${booking.sessionId}/join`,
    policyUrl: `${appBaseUrl}/policies/cancellation`,
    generatedAt: now,
  });
}

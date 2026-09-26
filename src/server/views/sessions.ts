import type { Database } from "@/server/platform/db/client";
import { findUsersByIds } from "@/server/modules/auth";
import { findMentorProfile } from "@/server/modules/profiles";
import {
  findSessionTitles,
  listBookingsForMentor,
  listBookingsForStudent,
  sessionWindow,
  type BookingWithSession,
} from "@/server/modules/booking";

export type BookingStatusName = BookingWithSession["status"];

export type SessionCardView = {
  bookingId: string;
  sessionId: string;
  status: BookingStatusName;
  kind: "one_on_one" | "group" | "event";
  title: string;
  eventSlug: string | null;
  start: Date;
  end: Date;
  priceMinor: number;
  currency: string;
  /** The other person: the mentor for a student's list, the student for a mentor's list. */
  counterpart: {
    userId: string;
    name: string;
    timezone: string;
    slug: string | null;
    headline: string | null;
  };
  /** Set on a hosted group session or event collapsed to one row: how many people registered. */
  attendeeCount?: number;
};

const UPCOMING: BookingStatusName[] = ["held", "confirmed"];
const HISTORY: BookingStatusName[] = [
  "awaiting_outcome",
  "completed",
  "no_show_mentor",
  "no_show_student",
  "disputed",
  "resolved_refunded",
];

async function toCards(
  db: Database,
  rows: BookingWithSession[],
  counterpartOf: (row: BookingWithSession) => string,
): Promise<SessionCardView[]> {
  if (rows.length === 0) return [];
  const counterpartIds = [...new Set(rows.map(counterpartOf))];
  const [titles, people, profiles] = await Promise.all([
    findSessionTitles(
      db,
      rows.map((r) => r.sessionId),
    ),
    findUsersByIds(db, counterpartIds),
    Promise.all(counterpartIds.map((id) => findMentorProfile(db, id))),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const profileById = new Map(profiles.filter((p) => p !== undefined).map((p) => [p!.userId, p!]));

  return rows.map((row) => {
    const { start, end } = sessionWindow(row.session);
    const counterpartId = counterpartOf(row);
    const person = personById.get(counterpartId);
    const profile = profileById.get(counterpartId);
    const title = titles.get(row.sessionId);
    return {
      bookingId: row.id,
      sessionId: row.sessionId,
      status: row.status,
      kind: row.session.kind,
      title: title?.title ?? "Session",
      eventSlug: title?.eventSlug ?? null,
      start,
      end,
      priceMinor: row.priceMinor,
      currency: row.currency,
      counterpart: {
        userId: counterpartId,
        name: person?.displayName ?? "Former member",
        timezone: person?.timezone ?? "UTC",
        slug: profile?.isListed ? profile.slug : null,
        headline: profile?.headline ?? null,
      },
    };
  });
}

/** A student's sessions: what's coming up (soonest first) and what already happened (newest first). */
export async function loadStudentSessions(db: Database, studentId: string, now: Date) {
  const rows = await listBookingsForStudent(db, studentId, { statuses: [...UPCOMING, ...HISTORY] });
  const cards = await toCards(db, rows, (row) => row.session.hostUserId);
  return splitByTime(cards, now);
}

/** Sessions a mentor is hosting — 1:1 bookings as they are, and each group session or event as
 * one row with its attendee count rather than one row per seat. */
export async function loadHostedSessions(db: Database, mentorUserId: string, now: Date) {
  const rows = await listBookingsForMentor(db, mentorUserId, {
    statuses: [...UPCOMING, ...HISTORY],
  });
  const cards = await toCards(db, rows, (row) => row.studentId);
  // Split first so seats in different states (held vs completed) never merge into one row.
  const { upcoming, past } = splitByTime(cards, now);
  return { upcoming: collapseSeats(upcoming), past: collapseSeats(past) };
}

function collapseSeats(cards: SessionCardView[]): SessionCardView[] {
  const bySession = new Map<string, SessionCardView>();
  const result: SessionCardView[] = [];
  for (const card of cards) {
    if (card.kind === "one_on_one") {
      result.push(card);
      continue;
    }
    const existing = bySession.get(card.sessionId);
    if (existing) {
      existing.attendeeCount = (existing.attendeeCount ?? 1) + 1;
      continue;
    }
    const collapsed: SessionCardView = { ...card, attendeeCount: 1 };
    bySession.set(card.sessionId, collapsed);
    result.push(collapsed);
  }
  return result;
}

function splitByTime(cards: SessionCardView[], now: Date) {
  const upcoming = cards
    .filter((c) => UPCOMING.includes(c.status) && c.end > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const past = cards
    .filter((c) => HISTORY.includes(c.status))
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  return { upcoming, past };
}

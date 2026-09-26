import type { Database } from "@/server/platform/db/client";
import { findUserById, findUsersByIds } from "@/server/modules/auth";
import { findMentorProfile } from "@/server/modules/profiles";
import {
  findSession,
  findSessionTitles,
  getEventBySlug,
  listLiveBookingsForSession,
  listMyWaitlistEntries,
  listUpcomingGroupSessionsForHost,
  sessionWindow,
} from "@/server/modules/booking";
import type { SeatSession } from "@/ui/seat-registration";

export type PublicEventView = {
  slug: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  recordingUrl: string | null;
  host: {
    userId: string;
    name: string;
    slug: string | null;
    headline: string | null;
  };
  seat: SeatSession;
};

/**
 * A public event page (docs/09 §9). `unlisted` and `private` events are never rendered here —
 * `unlisted` is reached through the API with its link, and `private` needs an invite token.
 */
export async function loadPublicEvent(db: Database, slug: string): Promise<PublicEventView | null> {
  const event = await getEventBySlug(db, slug);
  if (!event || event.visibility !== "public") return null;
  const [host, profile, liveBookings] = await Promise.all([
    findUserById(db, event.session.hostUserId),
    findMentorProfile(db, event.session.hostUserId),
    listLiveBookingsForSession(db, event.sessionId),
  ]);
  const { start, end } = sessionWindow(event.session);
  const name = host?.displayName ?? "A mentor";
  return {
    slug: event.slug,
    title: event.title,
    description: event.descriptionMd,
    start,
    end,
    recordingUrl:
      event.recordingUrl && event.recordingVisibility === "public" ? event.recordingUrl : null,
    host: {
      userId: event.session.hostUserId,
      name,
      slug: profile?.isListed ? profile.slug : null,
      headline: profile?.headline ?? null,
    },
    seat: {
      sessionId: event.sessionId,
      kind: "event",
      hostUserId: event.session.hostUserId,
      hostFirstName: name.split(" ")[0]!,
      seatPriceMinor: 0,
      currency: event.session.currency,
      capacity: event.session.capacity,
      liveSeats: liveBookings.length,
      start: start.toISOString(),
      registrationClosesAt: event.session.registrationClosesAt?.toISOString() ?? null,
      status: event.session.status,
    },
  };
}

export type GroupSessionTeaser = {
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  minParticipants: number;
  seat: SeatSession;
};

/** A mentor's upcoming paid group sessions, for their profile (docs/09 §8). */
export async function loadGroupSessionsForHost(
  db: Database,
  hostUserId: string,
  hostName: string,
  now: Date,
): Promise<GroupSessionTeaser[]> {
  const sessions = await listUpcomingGroupSessionsForHost(db, hostUserId, now);
  const seats = await Promise.all(sessions.map((s) => listLiveBookingsForSession(db, s.id)));
  return sessions.map((session, index) => {
    const { start, end } = sessionWindow(session);
    return {
      title: session.title,
      description: session.descriptionMd,
      start,
      end,
      minParticipants: session.minParticipants,
      seat: {
        sessionId: session.id,
        kind: "group",
        hostUserId,
        hostFirstName: hostName.split(" ")[0]!,
        seatPriceMinor: session.seatPriceMinor,
        currency: session.currency,
        capacity: session.capacity,
        liveSeats: seats[index]!.length,
        start: start.toISOString(),
        registrationClosesAt: session.registrationClosesAt?.toISOString() ?? null,
        status: session.status,
      },
    };
  });
}

export type WaitlistItem = {
  entryId: string;
  sessionId: string;
  status: "waiting" | "offered";
  offerExpiresAt: Date | null;
  kind: "group" | "event";
  title: string;
  eventSlug: string | null;
  start: Date;
  hostName: string;
  seatPriceMinor: number;
  currency: string;
};

/** Waitlist places still open for this person, soonest session first (docs/09 §8). */
export async function loadMyWaitlist(db: Database, studentId: string): Promise<WaitlistItem[]> {
  const entries = (await listMyWaitlistEntries(db, studentId)).filter(
    (e) => e.status === "waiting" || e.status === "offered",
  );
  if (entries.length === 0) return [];
  const [titles, sessions] = await Promise.all([
    findSessionTitles(
      db,
      entries.map((e) => e.sessionId),
    ),
    Promise.all(entries.map((e) => findSession(db, e.sessionId))),
  ]);
  const hosts = await findUsersByIds(db, [
    ...new Set(sessions.flatMap((s) => (s ? [s.hostUserId] : []))),
  ]);
  const hostName = new Map(hosts.map((h) => [h.id, h.displayName]));
  return entries
    .flatMap((entry, index) => {
      const session = sessions[index];
      if (!session || session.status !== "scheduled") return [];
      return [
        {
          entryId: entry.id,
          sessionId: entry.sessionId,
          status: entry.status as "waiting" | "offered",
          offerExpiresAt: entry.offerExpiresAt,
          kind: session.kind as "group" | "event",
          title: titles.get(entry.sessionId)?.title ?? "Session",
          eventSlug: titles.get(entry.sessionId)?.eventSlug ?? null,
          start: sessionWindow(session).start,
          hostName: hostName.get(session.hostUserId) ?? "A mentor",
          seatPriceMinor: session.seatPriceMinor,
          currency: session.currency,
        },
      ];
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

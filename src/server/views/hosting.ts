import type { Database } from "@/server/platform/db/client";
import { getSetting } from "@/server/platform/settings/settings";
import { findMentorProfile, latestAttestation } from "@/server/modules/profiles";
import { hasActivePayoutAccount } from "@/server/modules/payments";
import {
  listHostedSeatSessions,
  listLiveBookingsForSession,
  sessionWindow,
} from "@/server/modules/booking";

export type HostedItem = {
  sessionId: string;
  kind: "group" | "event";
  title: string;
  start: Date;
  end: Date;
  status: string;
  capacity: number;
  liveSeats: number;
  minParticipants: number;
  seatPriceMinor: number;
  currency: string;
  eventSlug: string | null;
  visibility: string | null;
  recordingUrl: string | null;
  hasMeetingLink: boolean;
};

export type HostingWorkspace = {
  canHostEvents: boolean;
  /** Null when this mentor may sell group seats; otherwise what's missing, in plain words. */
  groupBlocker: string | null;
  upcoming: HostedItem[];
  past: HostedItem[];
  limits: {
    capacityMax: number;
    minSeatPriceMinor: number;
    minParticipantsDefault: number;
    registrationCloseBeforeMin: number;
  };
};

const EVENT_HOST_ROLES = ["event_host", "admin", "super_admin"];

/**
 * The mentor's events and group sessions (docs/09 §8, §9): what's coming up with live seat counts,
 * what has run, and whether they may create each kind. Null until the mentor is approved.
 */
export async function loadHostingWorkspace(
  db: Database,
  userId: string,
  roles: ReadonlySet<string>,
  now: Date,
): Promise<HostingWorkspace | null> {
  const profile = await findMentorProfile(db, userId);
  if (!profile || profile.applicationStatus !== "approved") return null;

  const [
    sessions,
    payoutActive,
    attestation,
    capacityMax,
    minSeatPriceMinor,
    minDefault,
    closeMin,
  ] = await Promise.all([
    listHostedSeatSessions(db, userId),
    hasActivePayoutAccount(db, userId),
    latestAttestation(db, userId),
    getSetting(db, "group.capacity_max", now),
    getSetting(db, "group.min_seat_price_minor", now),
    getSetting(db, "group.min_participants_default", now),
    getSetting(db, "group.registration_close_before_min", now),
  ]);
  const seats = await Promise.all(sessions.map((s) => listLiveBookingsForSession(db, s.id)));

  const items: HostedItem[] = sessions.map((session, index) => {
    const { start, end } = sessionWindow(session);
    return {
      sessionId: session.id,
      kind: session.kind as "group" | "event",
      title: session.title,
      start,
      end,
      status: session.status,
      capacity: session.capacity,
      liveSeats: seats[index]!.length,
      minParticipants: session.minParticipants,
      seatPriceMinor: session.seatPriceMinor,
      currency: session.currency,
      eventSlug: session.eventSlug,
      visibility: session.eventVisibility,
      recordingUrl: session.recordingUrl,
      hasMeetingLink: session.meetingUrl !== null,
    };
  });

  let groupBlocker: string | null = null;
  if (profile.payoutMode !== "paid") {
    groupBlocker = "Group sessions are paid, and you mentor as a volunteer.";
  } else if (!payoutActive) {
    groupBlocker = "Set up payouts first — seats are paid for up front.";
  } else if (!attestation || attestation.expiresAt <= now) {
    groupBlocker = "Confirm where you can work (in your application) before selling seats.";
  }

  return {
    canHostEvents: EVENT_HOST_ROLES.some((role) => roles.has(role)),
    groupBlocker,
    // Soonest first for what's coming up; most recent first for history.
    upcoming: items.filter((i) => i.end > now).reverse(),
    past: items.filter((i) => i.end <= now),
    limits: {
      capacityMax,
      minSeatPriceMinor,
      minParticipantsDefault: minDefault,
      registrationCloseBeforeMin: closeMin,
    },
  };
}

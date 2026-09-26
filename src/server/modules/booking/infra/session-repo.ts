import { and, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { parseTstzRange, toTstzRange } from "@/server/platform/db/sql-helpers";
import { calendarBlocks, eventDetails, mentorServices, sessions } from "./tables";

export type SessionRow = typeof sessions.$inferSelect;

export async function findSession(executor: Executor, id: string): Promise<SessionRow | undefined> {
  const [row] = await executor.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return row;
}

export function sessionWindow(session: SessionRow): { start: Date; end: Date } {
  return parseTstzRange(session.during);
}

export type SessionTitle = { title: string; eventSlug: string | null };

/** Display titles for a batch of sessions — an event's own title, otherwise its service's title
 * (1:1 services and the per-session service row a group session creates). */
export async function findSessionTitles(
  executor: Executor,
  sessionIds: string[],
): Promise<Map<string, SessionTitle>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await executor
    .select({
      id: sessions.id,
      serviceTitle: mentorServices.title,
      eventTitle: eventDetails.title,
      eventSlug: eventDetails.slug,
    })
    .from(sessions)
    .leftJoin(mentorServices, eq(mentorServices.id, sessions.serviceId))
    .leftJoin(eventDetails, eq(eventDetails.sessionId, sessions.id))
    .where(inArray(sessions.id, sessionIds));
  return new Map(
    rows.map((row) => [
      row.id,
      { title: row.eventTitle ?? row.serviceTitle ?? "Session", eventSlug: row.eventSlug },
    ]),
  );
}

export async function insertOneOnOneSession(
  executor: Executor,
  input: {
    hostUserId: string;
    serviceId: string;
    start: Date;
    end: Date;
    seatPriceMinor: number;
    currency: string;
    meetingProvider: string | null;
    meetingUrl: string | null;
  },
): Promise<SessionRow> {
  const [row] = await executor
    .insert(sessions)
    .values({
      id: newId(),
      kind: "one_on_one",
      hostUserId: input.hostUserId,
      serviceId: input.serviceId,
      during: toTstzRange(input.start, input.end),
      status: "scheduled",
      capacity: 1,
      minParticipants: 1,
      seatPriceMinor: input.seatPriceMinor,
      currency: input.currency,
      meetingProvider: input.meetingProvider,
      meetingUrl: input.meetingUrl,
    })
    .returning();
  return row!;
}

export async function setSessionStatus(
  executor: Executor,
  id: string,
  status: SessionRow["status"],
): Promise<void> {
  await executor.update(sessions).set({ status, updatedAt: new Date() }).where(eq(sessions.id, id));
}

/**
 * Row-locks the session for the seat-booking / waitlist-offer transaction (docs/09 §6.2, §6.4) —
 * serializes concurrent seat claims for one session, the group-capacity analogue of 1:1's
 * per-mentor-day advisory lock.
 */
export async function findSessionForUpdate(
  executor: Executor,
  id: string,
): Promise<SessionRow | undefined> {
  const [row] = await executor
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .for("update")
    .limit(1);
  return row;
}

export async function insertGroupOrEventSession(
  executor: Executor,
  input: {
    kind: "group" | "event";
    hostUserId: string;
    serviceId: string | null;
    start: Date;
    end: Date;
    capacity: number;
    minParticipants: number;
    seatPriceMinor: number;
    currency: string;
    registrationClosesAt: Date;
    minParticipantsCheckAt: Date | null;
    meetingProvider: string | null;
    meetingUrl: string | null;
  },
): Promise<SessionRow> {
  const [row] = await executor
    .insert(sessions)
    .values({
      id: newId(),
      kind: input.kind,
      hostUserId: input.hostUserId,
      serviceId: input.serviceId,
      during: toTstzRange(input.start, input.end),
      status: "scheduled",
      capacity: input.capacity,
      minParticipants: input.minParticipants,
      seatPriceMinor: input.seatPriceMinor,
      currency: input.currency,
      registrationClosesAt: input.registrationClosesAt,
      minParticipantsCheckAt: input.minParticipantsCheckAt,
      meetingProvider: input.meetingProvider,
      meetingUrl: input.meetingUrl,
    })
    .returning();
  return row!;
}

/** docs/18 B25: capacity may never drop below the seats already live. Validated by the caller
 * (`canReduceCapacity`) before this ever runs. */
export async function setSessionCapacity(
  executor: Executor,
  id: string,
  capacity: number,
): Promise<void> {
  await executor
    .update(sessions)
    .set({ capacity, updatedAt: new Date() })
    .where(eq(sessions.id, id));
}

/** Group/event sessions whose min-participants check is due (the recurring sweep's own safety net
 * alongside the per-session scheduled outbox job — docs/09 §8 has no explicit job spec; this mirrors
 * the payment sweeper's belt-and-suspenders pattern, docs/08 §10). */
export async function listSessionsPendingMinCheck(
  executor: Executor,
  now: Date,
): Promise<SessionRow[]> {
  return executor
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.kind, "group"),
        eq(sessions.status, "scheduled"),
        sql`${sessions.minParticipantsCheckAt} IS NOT NULL AND ${sessions.minParticipantsCheckAt} <= ${now.toISOString()}::timestamptz`,
      ),
    );
}

/** Active blocks (`during` already includes buffer) for a mentor overlapping [from, to). */
export async function listActiveBlocksOverlapping(
  executor: Executor,
  mentorId: string,
  from: Date,
  to: Date,
): Promise<{ start: Date; end: Date }[]> {
  const rows = await executor.execute<{ during: string }>(sql`
    SELECT during FROM app.calendar_blocks
    WHERE mentor_id = ${mentorId} AND active
      AND during && ${toTstzRange(from, to)}::tstzrange
  `);
  return rows.map((r) => parseTstzRange(r.during));
}

export async function insertCalendarBlock(
  executor: Executor,
  input: {
    mentorId: string;
    sourceType: "session" | "manual";
    sourceId: string | null;
    start: Date;
    end: Date;
  },
): Promise<{ id: string }> {
  const id = newId();
  await executor.insert(calendarBlocks).values({
    id,
    mentorId: input.mentorId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    during: toTstzRange(input.start, input.end),
    active: true,
  });
  return { id };
}

export async function releaseCalendarBlockForSession(
  executor: Executor,
  sessionId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(calendarBlocks)
    .set({ active: false, releasedAt: now })
    .where(
      and(
        eq(calendarBlocks.sourceType, "session"),
        eq(calendarBlocks.sourceId, sessionId),
        eq(calendarBlocks.active, true),
      ),
    );
}

/** Mentor-local session counts for the daily cap, derived from live (non-cancelled) sessions. */
export async function countSessionsByLocalDate(
  executor: Executor,
  mentorUserId: string,
  timeZone: string,
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const rows = await executor.execute<{ local_date: string; n: number }>(sql`
    SELECT (lower(during) AT TIME ZONE ${timeZone})::date::text AS local_date, count(*)::int AS n
    FROM app.sessions
    WHERE host_user_id = ${mentorUserId} AND status = 'scheduled'
      AND during && ${toTstzRange(from, to)}::tstzrange
    GROUP BY 1
  `);
  return new Map(rows.map((r) => [r.local_date, r.n]));
}

/** A host's upcoming group sessions still open for registration (docs/09 §8), soonest first. */
export async function listUpcomingGroupSessionsForHost(
  executor: Executor,
  hostUserId: string,
  now: Date,
): Promise<(SessionRow & { title: string; descriptionMd: string | null })[]> {
  const rows = await executor
    .select({
      session: sessions,
      title: mentorServices.title,
      descriptionMd: mentorServices.descriptionMd,
    })
    .from(sessions)
    .innerJoin(mentorServices, eq(mentorServices.id, sessions.serviceId))
    .where(
      and(
        eq(sessions.hostUserId, hostUserId),
        eq(sessions.kind, "group"),
        eq(sessions.status, "scheduled"),
        sql`lower(${sessions.during}) > ${now.toISOString()}::timestamptz`,
      ),
    );
  return rows
    .map((r) => ({ ...r.session, title: r.title, descriptionMd: r.descriptionMd }))
    .sort((a, b) => sessionWindow(a).start.getTime() - sessionWindow(b).start.getTime());
}

export type HostedSeatSession = SessionRow & {
  title: string;
  eventSlug: string | null;
  eventVisibility: string | null;
  recordingUrl: string | null;
};

/** Every group session and event a host has run or scheduled, newest start first. */
export async function listHostedSeatSessions(
  executor: Executor,
  hostUserId: string,
): Promise<HostedSeatSession[]> {
  const rows = await executor
    .select({
      session: sessions,
      serviceTitle: mentorServices.title,
      eventTitle: eventDetails.title,
      eventSlug: eventDetails.slug,
      eventVisibility: eventDetails.visibility,
      recordingUrl: eventDetails.recordingUrl,
    })
    .from(sessions)
    .leftJoin(mentorServices, eq(mentorServices.id, sessions.serviceId))
    .leftJoin(eventDetails, eq(eventDetails.sessionId, sessions.id))
    .where(and(eq(sessions.hostUserId, hostUserId), inArray(sessions.kind, ["group", "event"])));
  return rows
    .map((r) => ({
      ...r.session,
      title: r.eventTitle ?? r.serviceTitle ?? "Session",
      eventSlug: r.eventSlug,
      eventVisibility: r.eventVisibility,
      recordingUrl: r.recordingUrl,
    }))
    .sort((a, b) => sessionWindow(b).start.getTime() - sessionWindow(a).start.getTime());
}

import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { eventDetails, eventInvites, sessions } from "./tables";
import type { EventVisibility, RecordingVisibility } from "../domain/types";

export type EventDetailsRow = typeof eventDetails.$inferSelect;
export type EventInviteRow = typeof eventInvites.$inferSelect;
export type EventWithSession = EventDetailsRow & { session: typeof sessions.$inferSelect };

export async function insertEventDetails(
  executor: Executor,
  input: {
    sessionId: string;
    slug: string;
    title: string;
    descriptionMd: string | null;
    visibility: EventVisibility;
  },
): Promise<EventDetailsRow> {
  const [row] = await executor.insert(eventDetails).values(input).returning();
  return row!;
}

export async function findEventDetails(
  executor: Executor,
  sessionId: string,
): Promise<EventDetailsRow | undefined> {
  const [row] = await executor
    .select()
    .from(eventDetails)
    .where(eq(eventDetails.sessionId, sessionId))
    .limit(1);
  return row;
}

export async function findEventBySlug(
  executor: Executor,
  slug: string,
): Promise<EventWithSession | undefined> {
  const [row] = await executor
    .select({ details: eventDetails, session: sessions })
    .from(eventDetails)
    .innerJoin(sessions, eq(sessions.id, eventDetails.sessionId))
    .where(eq(eventDetails.slug, slug))
    .limit(1);
  return row ? { ...row.details, session: row.session } : undefined;
}

export async function slugTaken(executor: Executor, slug: string): Promise<boolean> {
  const [row] = await executor
    .select({ sessionId: eventDetails.sessionId })
    .from(eventDetails)
    .where(eq(eventDetails.slug, slug))
    .limit(1);
  return row !== undefined;
}

/** Public/indexable upcoming events (docs/22 §10.1) for `/events`. */
export async function listUpcomingPublicEvents(
  executor: Executor,
  now: Date,
): Promise<EventWithSession[]> {
  const rows = await executor
    .select({ details: eventDetails, session: sessions })
    .from(eventDetails)
    .innerJoin(sessions, eq(sessions.id, eventDetails.sessionId))
    .where(
      and(
        eq(eventDetails.visibility, "public"),
        eq(sessions.status, "scheduled"),
        gte(sql`upper(${sessions.during})`, now.toISOString()),
      ),
    )
    .orderBy(desc(sessions.during));
  return rows.map((r) => ({ ...r.details, session: r.session }));
}

export async function setEventRecording(
  executor: Executor,
  sessionId: string,
  input: { recordingUrl: string; recordingVisibility: RecordingVisibility; postedAt: Date },
): Promise<EventDetailsRow | undefined> {
  const [row] = await executor
    .update(eventDetails)
    .set({
      recordingUrl: input.recordingUrl,
      recordingVisibility: input.recordingVisibility,
      recordingPostedAt: input.postedAt,
      updatedAt: input.postedAt,
    })
    .where(eq(eventDetails.sessionId, sessionId))
    .returning();
  return row;
}

/** `token` is a SHA-256 hash, never the raw secret — the caller (`events.ts`) mints the real token
 * with `randomToken()`, hands it to the host once, and only ever persists/looks up its hash, the
 * same discipline the auth module uses for password-reset/email-verification tokens. */
export async function insertEventInvite(
  executor: Executor,
  input: { sessionId: string; token: string; createdByUserId: string; expiresAt: Date | null },
): Promise<EventInviteRow> {
  const [row] = await executor
    .insert(eventInvites)
    .values({ id: newId(), usedAt: null, usedByUserId: null, ...input })
    .returning();
  return row!;
}

export async function findEventInviteByToken(
  executor: Executor,
  sessionId: string,
  token: string,
): Promise<EventInviteRow | undefined> {
  const [row] = await executor
    .select()
    .from(eventInvites)
    .where(and(eq(eventInvites.sessionId, sessionId), eq(eventInvites.token, token)))
    .limit(1);
  return row;
}

export async function markInviteUsed(
  executor: Executor,
  id: string,
  usedByUserId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(eventInvites)
    .set({ usedAt: now, usedByUserId })
    .where(eq(eventInvites.id, id));
}

export async function listInvitesForSession(
  executor: Executor,
  sessionId: string,
): Promise<EventInviteRow[]> {
  return executor.select().from(eventInvites).where(eq(eventInvites.sessionId, sessionId));
}

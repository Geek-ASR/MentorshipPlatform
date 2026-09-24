import type { Database, Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import type { UserActor } from "@/server/platform/authz/actor";
import { findMentorProfile } from "@/server/modules/profiles";
import { isAllowedRecordingUrl } from "../domain/recording";
import { slugify } from "../domain/slug";
import type { EventVisibility, RecordingVisibility } from "../domain/types";
import {
  findSession,
  findSessionForUpdate,
  insertCalendarBlock,
  insertGroupOrEventSession,
  type SessionRow,
} from "../infra/session-repo";
import {
  findEventBySlug,
  findEventDetails,
  insertEventDetails,
  insertEventInvite,
  listInvitesForSession,
  listUpcomingPublicEvents,
  setEventRecording,
  slugTaken,
  type EventDetailsRow,
  type EventInviteRow,
  type EventWithSession,
} from "../infra/event-repo";
import { cancelEverySeatAndRefund } from "./group-sessions";

export type CreateEventInput = {
  title: string;
  descriptionMd?: string | null;
  start: Date;
  end: Date;
  capacity: number;
  visibility: EventVisibility;
};

export type CreateEventResult = { session: SessionRow; details: EventDetailsRow };

function canHostEvents(actor: UserActor): boolean {
  return (
    actor.roles.has("event_host") || actor.roles.has("admin") || actor.roles.has("super_admin")
  );
}

async function uniqueEventSlug(db: Executor, title: string): Promise<string> {
  const root = slugify(title) || "event";
  let candidate = root;
  let suffix = 2;
  while (await slugTaken(db, candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Creates a free event (docs/09 §9). Hosts are approved mentors granted `event_host` (or staff) —
 * docs/07 §6.1 describes grantees as "approved mentors or partners", which this phase reads as
 * requiring an existing approved mentor profile rather than relaxing `sessions.host_user_id`'s FK
 * to plain `users` for a "partner" concept with no other MVP scaffolding (documented deviation).
 * No separate draft/publish step (docs/06 names `POST /me/events/{id}/publish`) — like every other
 * session-creation flow in this codebase (mentor services, group sessions, 1:1 bookings), an event
 * is live from creation, discoverable per whatever `visibility` the host chose.
 */
export async function createEvent(
  db: Database,
  actor: UserActor,
  input: CreateEventInput,
  now: Date,
): Promise<CreateEventResult> {
  if (!canHostEvents(actor)) {
    throw new AppError("FORBIDDEN", { detail: "You don't have permission to host events." });
  }
  const mentor = await findMentorProfile(db, actor.userId);
  if (!mentor || mentor.applicationStatus !== "approved") {
    throw new AppError("BAD_REQUEST", {
      detail: "Only an approved mentor profile can host an event.",
    });
  }
  if (input.end <= input.start) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "end", code: "invalid_range", message: "End must be after start." }],
    });
  }
  if (input.start <= now) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "start", code: "in_past", message: "Start must be in the future." }],
    });
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "capacity", code: "out_of_range", message: "Capacity must be at least 1." }],
    });
  }

  return db.transaction(async (tx) => {
    const session = await insertGroupOrEventSession(tx, {
      kind: "event",
      hostUserId: actor.userId,
      serviceId: null,
      start: input.start,
      end: input.end,
      capacity: input.capacity,
      minParticipants: 1, // unused for events — no min-participants check applies (docs/09 §9).
      seatPriceMinor: 0,
      currency: "INR",
      registrationClosesAt: input.start,
      minParticipantsCheckAt: null,
      meetingProvider: null,
      meetingUrl: null,
    });
    await insertCalendarBlock(tx, {
      mentorId: actor.userId,
      sourceType: "session",
      sourceId: session.id,
      start: input.start,
      end: input.end,
    });
    const slug = await uniqueEventSlug(tx, input.title);
    const details = await insertEventDetails(tx, {
      sessionId: session.id,
      slug,
      title: input.title,
      descriptionMd: input.descriptionMd ?? null,
      visibility: input.visibility,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: actor.userId,
      action: "event.created",
      targetType: "session",
      targetId: session.id,
      metadata: { slug, capacity: input.capacity, visibility: input.visibility },
    });
    return { session, details };
  });
}

export async function cancelEvent(
  db: Database,
  hostUserId: string,
  sessionId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await findSessionForUpdate(tx, sessionId);
    if (!session || session.hostUserId !== hostUserId || session.kind !== "event") {
      throw new AppError("NOT_FOUND");
    }
    if (session.status !== "scheduled") {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "This event isn't cancellable." });
    }
    await cancelEverySeatAndRefund(
      tx,
      session,
      now,
      "event_cancel",
      0,
      "session.event_cancelled_by_host",
    );
  });
}

/** docs/09 §9: "host posts a URL (validated allowlist), visibility attendees or public." */
export async function setEventRecordingUrl(
  db: Database,
  hostUserId: string,
  sessionId: string,
  recordingUrl: string,
  recordingVisibility: RecordingVisibility,
  now: Date,
): Promise<EventDetailsRow> {
  const session = await findSession(db, sessionId);
  if (!session || session.hostUserId !== hostUserId || session.kind !== "event") {
    throw new AppError("NOT_FOUND");
  }
  if (!isAllowedRecordingUrl(recordingUrl)) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        {
          path: "recordingUrl",
          code: "host_not_allowed",
          message: "Recording links must be YouTube, Google Drive or Vimeo URLs.",
        },
      ],
    });
  }
  const updated = await setEventRecording(db, sessionId, {
    recordingUrl,
    recordingVisibility,
    postedAt: now,
  });
  if (!updated) throw new AppError("NOT_FOUND");
  await writeAudit(db, {
    actorType: "user",
    actorUserId: hostUserId,
    action: "event.recording_posted",
    targetType: "session",
    targetId: sessionId,
    metadata: { recordingVisibility },
  });
  return updated;
}

export type CreatedInvite = { invite: EventInviteRow; token: string };

/** Mints one single-use invite token per call (docs/09 §9 "private (invite tokens)") — a host
 * generates one per invitee rather than one shared reusable link (documented design decision, no
 * schema is given in the docs to follow). The raw token is returned once and never persisted. */
export async function createEventInvite(
  db: Database,
  hostUserId: string,
  sessionId: string,
  expiresAt: Date | null,
): Promise<CreatedInvite> {
  const session = await findSession(db, sessionId);
  if (!session || session.hostUserId !== hostUserId || session.kind !== "event") {
    throw new AppError("NOT_FOUND");
  }
  const token = randomToken();
  const invite = await insertEventInvite(db, {
    sessionId,
    token: sha256Hex(token),
    createdByUserId: hostUserId,
    expiresAt,
  });
  return { invite, token };
}

export async function listEventInvites(
  db: Database,
  hostUserId: string,
  sessionId: string,
): Promise<EventInviteRow[]> {
  const session = await findSession(db, sessionId);
  if (!session || session.hostUserId !== hostUserId || session.kind !== "event") {
    throw new AppError("NOT_FOUND");
  }
  return listInvitesForSession(db, sessionId);
}

export function listPublicEvents(db: Database, now: Date): Promise<EventWithSession[]> {
  return listUpcomingPublicEvents(db, now);
}

/** Public event page lookup (docs/22 §10.1) — `unlisted`/`private` events resolve by exact slug too
 * (link-only access), the route layer decides what to render for each visibility. */
export function getEventBySlug(db: Database, slug: string): Promise<EventWithSession | undefined> {
  return findEventBySlug(db, slug);
}

export function getEventDetailsForSession(
  db: Database,
  sessionId: string,
): Promise<EventDetailsRow | undefined> {
  return findEventDetails(db, sessionId);
}

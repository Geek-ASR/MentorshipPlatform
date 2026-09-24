import { z } from "zod";
import { getEnv } from "@/config/env";
import type { Database, Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { defineJob } from "@/server/platform/outbox/outbox";
import { getSetting } from "@/server/platform/settings/settings";
import { parseTstzRange } from "@/server/platform/db/sql-helpers";
import type { UserActor } from "@/server/platform/authz/actor";
import { findUserById } from "@/server/modules/auth";
import { listLiveBookingsForSession } from "../infra/booking-repo";
import { findSessionForUpdate } from "../infra/session-repo";
import {
  findActiveWaitlistEntryForStudent,
  findNextWaitingEntryForUpdate,
  findWaitlistEntry,
  insertWaitlistEntry,
  listExpiredOffers,
  listWaitlistForStudent,
  setWaitlistEntryStatus,
  type WaitlistEntryRow,
} from "../infra/waitlist-repo";
import { insertSeatForStudent, type BookSeatResult } from "./seat-booking";
import { notify } from "./notifications";

export async function joinWaitlist(
  db: Database,
  actor: UserActor,
  sessionId: string,
  now: Date,
): Promise<WaitlistEntryRow> {
  return db.transaction(async (tx) => {
    const session = await findSessionForUpdate(tx, sessionId);
    if (!session || (session.kind !== "group" && session.kind !== "event")) {
      throw new AppError("NOT_FOUND");
    }
    if (session.status !== "scheduled") {
      throw new AppError("BAD_REQUEST", { detail: "This session isn't open for a waitlist." });
    }
    if (session.registrationClosesAt && now >= session.registrationClosesAt) {
      throw new AppError("BAD_REQUEST", { detail: "Registration is closed." });
    }
    if (session.hostUserId === actor.userId) {
      throw new AppError("BAD_REQUEST", {
        detail: "You can't join the waitlist for your own session.",
      });
    }

    const liveBookings = await listLiveBookingsForSession(tx, sessionId);
    if (liveBookings.some((b) => b.studentId === actor.userId)) {
      throw new AppError("CONFLICT", { detail: "You already have a seat for this session." });
    }
    if (liveBookings.length < session.capacity) {
      throw new AppError("BAD_REQUEST", {
        detail: "This session has open seats — book it directly instead of joining the waitlist.",
      });
    }

    const existing = await findActiveWaitlistEntryForStudent(tx, sessionId, actor.userId);
    if (existing) return existing;

    const entry = await insertWaitlistEntry(tx, {
      sessionId,
      studentId: actor.userId,
      joinedAt: now,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: actor.userId,
      action: "waitlist.joined",
      targetType: "session",
      targetId: sessionId,
    });
    return entry;
  });
}

export async function leaveWaitlist(
  db: Database,
  actor: UserActor,
  sessionId: string,
  now: Date,
  appBaseUrl: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const entry = await findActiveWaitlistEntryForStudent(tx, sessionId, actor.userId);
    if (!entry) throw new AppError("NOT_FOUND");
    const wasOffered = entry.status === "offered";
    await setWaitlistEntryStatus(tx, entry.id, "left", null);
    if (wasOffered) {
      // The offer is freed back up — cascade to the next person now rather than waiting for the
      // expiry sweep (docs/09 §8: "offers equal to freed seats").
      await offerOrPromoteNextInLine(tx, sessionId, now, appBaseUrl);
    }
  });
}

export function listMyWaitlistEntries(
  db: Database,
  studentId: string,
): Promise<WaitlistEntryRow[]> {
  return listWaitlistForStudent(db, studentId);
}

/**
 * A seat just freed up (a cancellation, a refund, a no-show reversal) — offers it to whoever is
 * FIFO-next on the waitlist (docs/09 §8). The two paths diverge here: a paid group seat gets a
 * time-boxed *offer* the student must actively claim; a free event *auto-promotes* directly into a
 * confirmed registration with no claim step (docs/09 §9) — and only up until
 * `events.waitlist_auto_promote_until_min` before start, after which latecomers just stay queued.
 * Must run inside a transaction that already holds the session's row lock (or acquires it itself,
 * as this does) — callers that already locked the session via `findSessionForUpdate` reuse that
 * same lock for free within the transaction.
 */
export async function offerOrPromoteNextInLine(
  tx: Executor,
  sessionId: string,
  now: Date,
  appBaseUrl: string,
): Promise<void> {
  const session = await findSessionForUpdate(tx, sessionId);
  if (!session || session.status !== "scheduled") return;
  const liveBookings = await listLiveBookingsForSession(tx, sessionId);
  if (liveBookings.length >= session.capacity) return; // no free seat after all

  const next = await findNextWaitingEntryForUpdate(tx, sessionId);
  if (!next) return;

  if (session.kind === "event") {
    const autoPromoteUntilMin = await getSetting(tx, "events.waitlist_auto_promote_until_min", now);
    const { start } = parseTstzRange(session.during);
    if (now.getTime() > start.getTime() - autoPromoteUntilMin * 60_000) {
      return; // too close to start to auto-promote (docs/09 §9) — stays queued, unresolved.
    }
    await setWaitlistEntryStatus(tx, next.id, "claimed", null);
    await insertSeatForStudent(tx, session, next.studentId, [], now, appBaseUrl);
    await writeAudit(tx, {
      actorType: "system",
      action: "waitlist.auto_promoted",
      targetType: "session",
      targetId: sessionId,
      metadata: { studentId: next.studentId },
    });
    return;
  }

  const claimWindowMin = await getSetting(tx, "waitlist.claim_window_min", now);
  const rawExpiry = new Date(now.getTime() + claimWindowMin * 60_000);
  const offerExpiresAt =
    session.registrationClosesAt && session.registrationClosesAt < rawExpiry
      ? session.registrationClosesAt
      : rawExpiry;
  await setWaitlistEntryStatus(tx, next.id, "offered", offerExpiresAt);
  const student = await findUserById(tx, next.studentId);
  if (student) {
    await notify(
      tx,
      student.email,
      "A seat opened up",
      `A seat is now available for the group session you waitlisted for. Claim it by ${offerExpiresAt.toISOString()} or it goes to the next person in line.`,
    );
  }
}

/**
 * Claims a paid group-seat offer (docs/09 §8, docs/06 `POST /waitlist-offers/{id}/claim`). Re-checks
 * capacity under the same session row lock `bookSeat` uses — an offer is a soft promise, not a hard
 * hold, so a concurrent direct booking (or a second claim, docs/13 §6 "Waitlist claim race") can
 * still win the last seat; this loses gracefully and cascades to the next person instead of leaving
 * the seat stranded.
 */
export async function claimWaitlistOffer(
  db: Database,
  actor: UserActor,
  entryId: string,
  intakeAnswers: { questionId: string; value: string }[],
  now: Date,
  appBaseUrl: string,
): Promise<BookSeatResult> {
  return db.transaction(async (tx) => {
    const entry = await findWaitlistEntry(tx, entryId);
    if (!entry || entry.studentId !== actor.userId) throw new AppError("NOT_FOUND");
    if (entry.status !== "offered" || !entry.offerExpiresAt || entry.offerExpiresAt <= now) {
      throw new AppError("BAD_REQUEST", { detail: "This waitlist offer is no longer claimable." });
    }

    const session = await findSessionForUpdate(tx, entry.sessionId);
    if (!session || session.status !== "scheduled") throw new AppError("NOT_FOUND");

    const liveBookings = await listLiveBookingsForSession(tx, session.id);
    if (liveBookings.length >= session.capacity) {
      await setWaitlistEntryStatus(tx, entry.id, "expired", null);
      await offerOrPromoteNextInLine(tx, session.id, now, appBaseUrl);
      throw new AppError("SLOT_UNAVAILABLE", {
        detail: "This offer's seat was taken before you claimed it.",
      });
    }

    await setWaitlistEntryStatus(tx, entry.id, "claimed", null);
    return insertSeatForStudent(tx, session, actor.userId, intakeAnswers, now, appBaseUrl);
  });
}

/** Recurring sweep (docs/09 §8: "2h claim window") — expires lapsed paid-seat offers and cascades
 * each freed seat to the next person in line. */
export async function expireWaitlistOffersOnce(
  db: Database,
  now: Date,
  appBaseUrl: string,
): Promise<number> {
  const expired = await listExpiredOffers(db, now);
  let count = 0;
  for (const entry of expired) {
    await db.transaction(async (tx) => {
      const fresh = await findWaitlistEntry(tx, entry.id);
      if (!fresh || fresh.status !== "offered") return;
      await setWaitlistEntryStatus(tx, fresh.id, "expired", null);
      await offerOrPromoteNextInLine(tx, fresh.sessionId, now, appBaseUrl);
    });
    count += 1;
  }
  return count;
}

export const expireWaitlistOffers = defineJob({
  type: "booking.expire_waitlist_offers",
  schema: z.object({}),
  maxAttempts: 3,
  async handle(_payload, { db, clock }) {
    await expireWaitlistOffersOnce(db, clock.now(), getEnv().APP_BASE_URL);
  },
});

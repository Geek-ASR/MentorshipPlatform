import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { waitlistEntries } from "./tables";
import type { WaitlistEntryStatus } from "../domain/types";

export type WaitlistEntryRow = typeof waitlistEntries.$inferSelect;

export async function insertWaitlistEntry(
  executor: Executor,
  input: { sessionId: string; studentId: string; joinedAt: Date },
): Promise<WaitlistEntryRow> {
  const [row] = await executor
    .insert(waitlistEntries)
    .values({ id: newId(), status: "waiting", ...input })
    .returning();
  return row!;
}

export async function findWaitlistEntry(
  executor: Executor,
  id: string,
): Promise<WaitlistEntryRow | undefined> {
  const [row] = await executor
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .limit(1);
  return row;
}

export async function findActiveWaitlistEntryForStudent(
  executor: Executor,
  sessionId: string,
  studentId: string,
): Promise<WaitlistEntryRow | undefined> {
  const [row] = await executor
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.sessionId, sessionId),
        eq(waitlistEntries.studentId, studentId),
        inArray(waitlistEntries.status, ["waiting", "offered"]),
      ),
    )
    .limit(1);
  return row;
}

/** The next person in line (FIFO by join order, docs/09 §8) — locked so two concurrent offer/claim
 * attempts for the same session can never pick the same entry (docs/13 §6 "Waitlist claim race"). */
export async function findNextWaitingEntryForUpdate(
  executor: Executor,
  sessionId: string,
): Promise<WaitlistEntryRow | undefined> {
  const [row] = await executor
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.sessionId, sessionId), eq(waitlistEntries.status, "waiting")))
    .orderBy(asc(waitlistEntries.joinedAt))
    .for("update")
    .limit(1);
  return row;
}

export async function setWaitlistEntryStatus(
  executor: Executor,
  id: string,
  status: WaitlistEntryStatus,
  offerExpiresAt: Date | null,
): Promise<WaitlistEntryRow | undefined> {
  const [row] = await executor
    .update(waitlistEntries)
    .set({ status, offerExpiresAt, updatedAt: new Date() })
    .where(eq(waitlistEntries.id, id))
    .returning();
  return row;
}

/** `offered` entries whose claim window has lapsed (the paid-seat path only — free events never set
 * `offerExpiresAt`, docs/09 §9). */
export async function listExpiredOffers(
  executor: Executor,
  now: Date,
): Promise<WaitlistEntryRow[]> {
  return executor
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.status, "offered"),
        sql`${waitlistEntries.offerExpiresAt} IS NOT NULL AND ${waitlistEntries.offerExpiresAt} <= ${now.toISOString()}::timestamptz`,
      ),
    );
}

export async function listWaitlistForStudent(
  executor: Executor,
  studentId: string,
): Promise<WaitlistEntryRow[]> {
  return executor
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.studentId, studentId),
        inArray(waitlistEntries.status, ["waiting", "offered"]),
      ),
    );
}

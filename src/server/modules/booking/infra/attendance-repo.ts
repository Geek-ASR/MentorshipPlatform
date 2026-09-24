import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { attendanceClaims, attendanceSignals, bookings } from "./tables";
import type { AttendanceClaimOutcome, AttendanceSignalKind } from "../domain/types";

export type AttendanceSignalRow = typeof attendanceSignals.$inferSelect;
export type AttendanceClaimRow = typeof attendanceClaims.$inferSelect;

export async function recordSignal(
  executor: Executor,
  input: { sessionId: string; userId: string; kind: AttendanceSignalKind; occurredAt: Date },
): Promise<void> {
  await executor.insert(attendanceSignals).values({ id: newId(), ...input });
}

export async function listSignalsForSession(
  executor: Executor,
  sessionId: string,
): Promise<AttendanceSignalRow[]> {
  return executor
    .select()
    .from(attendanceSignals)
    .where(eq(attendanceSignals.sessionId, sessionId));
}

/** One claim per party per booking; a repeat submission replaces the earlier claim. */
export async function upsertClaim(
  executor: Executor,
  input: {
    bookingId: string;
    claimantUserId: string;
    outcome: AttendanceClaimOutcome;
    note: string | null;
  },
): Promise<AttendanceClaimRow> {
  const [row] = await executor
    .insert(attendanceClaims)
    .values({ id: newId(), ...input })
    .onConflictDoUpdate({
      target: [attendanceClaims.bookingId, attendanceClaims.claimantUserId],
      set: { outcome: input.outcome, note: input.note },
    })
    .returning();
  return row!;
}

export async function listClaimsForBooking(
  executor: Executor,
  bookingId: string,
): Promise<AttendanceClaimRow[]> {
  return executor.select().from(attendanceClaims).where(eq(attendanceClaims.bookingId, bookingId));
}

/** Every claim across every seat of a session (docs/18 S12: one student's claim can determine the
 * mentor's absence for the whole group session, not just their own booking). */
export async function listClaimsForSession(
  executor: Executor,
  sessionId: string,
): Promise<AttendanceClaimRow[]> {
  const rows = await executor
    .select({ claim: attendanceClaims })
    .from(attendanceClaims)
    .innerJoin(bookings, eq(bookings.id, attendanceClaims.bookingId))
    .where(eq(bookings.sessionId, sessionId));
  return rows.map((r) => r.claim);
}

export async function findClaim(
  executor: Executor,
  bookingId: string,
  claimantUserId: string,
): Promise<AttendanceClaimRow | undefined> {
  const [row] = await executor
    .select()
    .from(attendanceClaims)
    .where(
      and(
        eq(attendanceClaims.bookingId, bookingId),
        eq(attendanceClaims.claimantUserId, claimantUserId),
      ),
    )
    .limit(1);
  return row;
}

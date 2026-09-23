import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { toTstzRange } from "@/server/platform/db/sql-helpers";
import { bookings, sessions } from "./tables";
import type { BookingStatus } from "../domain/types";

export type BookingRow = typeof bookings.$inferSelect;

export async function findBooking(executor: Executor, id: string): Promise<BookingRow | undefined> {
  const [row] = await executor.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return row;
}

export async function insertBooking(
  executor: Executor,
  input: {
    sessionId: string;
    studentId: string;
    status: BookingStatus;
    holdExpiresAt: Date | null;
    priceMinor: number;
    currency: string;
    intakeAnswers: { questionId: string; value: string }[];
    policySnapshot: Record<string, unknown>;
  },
): Promise<BookingRow> {
  const [row] = await executor
    .insert(bookings)
    .values({ id: newId(), version: 0, ...input })
    .returning();
  return row!;
}

/**
 * Compare-and-set on `version` (docs/09 §6.4): the caller must have read the row in the same
 * transaction and pass its known version. Returns undefined if another writer won the race.
 */
export async function transitionBookingStatus(
  executor: Executor,
  id: string,
  expectedVersion: number,
  to: BookingStatus,
  now: Date,
): Promise<BookingRow | undefined> {
  const [row] = await executor
    .update(bookings)
    .set({ status: to, version: expectedVersion + 1, updatedAt: now })
    .where(and(eq(bookings.id, id), eq(bookings.version, expectedVersion)))
    .returning();
  return row;
}

/**
 * Lazily expires stale holds overlapping the requested range for a mentor (docs/09 §6.1 step 2),
 * releasing their calendar blocks in the same statement group. Runs inside the caller's transaction,
 * after the per-mentor-day advisory lock is held.
 */
export async function expireStaleHoldsOverlapping(
  executor: Executor,
  mentorId: string,
  from: Date,
  to: Date,
  now: Date,
): Promise<string[]> {
  const expired = await executor.execute<{ id: string; session_id: string }>(sql`
    UPDATE app.bookings b
    SET status = 'expired', version = b.version + 1, updated_at = ${now.toISOString()}::timestamptz
    FROM app.sessions s
    WHERE b.session_id = s.id AND s.host_user_id = ${mentorId}
      AND b.status = 'held' AND b.hold_expires_at <= ${now.toISOString()}::timestamptz
      AND s.during && ${toTstzRange(from, to)}::tstzrange
    RETURNING b.id, b.session_id
  `);
  if (expired.length === 0) return [];
  await executor.execute(sql`
    UPDATE app.calendar_blocks
    SET active = false, released_at = ${now.toISOString()}::timestamptz
    WHERE source_type = 'session' AND source_id IN (${sql.join(
      expired.map((r) => sql`${r.session_id}::uuid`),
      sql`, `,
    )}) AND active
  `);
  return expired.map((r) => r.id);
}

export async function countActiveHoldsForStudent(
  executor: Executor,
  studentId: string,
  now: Date,
): Promise<number> {
  const rows = await executor.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM app.bookings
    WHERE student_id = ${studentId} AND status = 'held' AND hold_expires_at > ${now.toISOString()}::timestamptz
  `);
  return rows[0]?.n ?? 0;
}

export async function countExpiredHoldsToday(
  executor: Executor,
  studentId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<number> {
  const rows = await executor.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM app.bookings
    WHERE student_id = ${studentId} AND status = 'expired'
      AND updated_at >= ${dayStart.toISOString()}::timestamptz AND updated_at < ${dayEnd.toISOString()}::timestamptz
  `);
  return rows[0]?.n ?? 0;
}

export async function countUpcomingFreeBookings(
  executor: Executor,
  studentId: string,
  now: Date,
): Promise<number> {
  const rows = await executor.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM app.bookings b
    JOIN app.sessions s ON s.id = b.session_id
    WHERE b.student_id = ${studentId} AND b.status = 'confirmed' AND b.price_minor = 0
      AND lower(s.during) > ${now.toISOString()}::timestamptz
  `);
  return rows[0]?.n ?? 0;
}

export async function hasOverlappingBooking(
  executor: Executor,
  studentId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const rows = await executor.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM app.bookings b
      JOIN app.sessions s ON s.id = b.session_id
      WHERE b.student_id = ${studentId}
        AND b.status IN ('held', 'confirmed')
        AND s.during && ${toTstzRange(start, end)}::tstzrange
    ) AS exists
  `);
  return rows[0]?.exists ?? false;
}

const LIVE_STATUSES: readonly BookingStatus[] = [
  "held",
  "confirmed",
  "awaiting_outcome",
  "completed",
  "no_show_mentor",
  "no_show_student",
  "disputed",
];

export type BookingWithSession = BookingRow & { session: typeof sessions.$inferSelect };

export async function listBookingsForStudent(
  executor: Executor,
  studentId: string,
  options: { statuses?: BookingStatus[] } = {},
): Promise<BookingWithSession[]> {
  const rows = await executor
    .select({ booking: bookings, session: sessions })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .where(
      and(
        eq(bookings.studentId, studentId),
        inArray(bookings.status, options.statuses ?? LIVE_STATUSES),
      ),
    )
    .orderBy(desc(bookings.createdAt));
  return rows.map((r) => ({ ...r.booking, session: r.session }));
}

export async function listBookingsForMentor(
  executor: Executor,
  mentorUserId: string,
  options: { statuses?: BookingStatus[] } = {},
): Promise<BookingWithSession[]> {
  const rows = await executor
    .select({ booking: bookings, session: sessions })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .where(
      and(
        eq(sessions.hostUserId, mentorUserId),
        inArray(bookings.status, options.statuses ?? LIVE_STATUSES),
      ),
    )
    .orderBy(desc(bookings.createdAt));
  return rows.map((r) => ({ ...r.booking, session: r.session }));
}

/** Confirmed, not-yet-ended bookings whose session end already passed `now` (for the finaliser job). */
export async function listConfirmedPastEnd(
  executor: Executor,
  now: Date,
): Promise<BookingWithSession[]> {
  const rows = await executor.execute<{ booking_id: string }>(sql`
    SELECT b.id AS booking_id FROM app.bookings b
    JOIN app.sessions s ON s.id = b.session_id
    WHERE b.status = 'confirmed' AND upper(s.during) <= ${now.toISOString()}::timestamptz
  `);
  if (rows.length === 0) return [];
  const result = await executor
    .select({ booking: bookings, session: sessions })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .where(
      inArray(
        bookings.id,
        rows.map((r) => r.booking_id),
      ),
    );
  return result.map((r) => ({ ...r.booking, session: r.session }));
}

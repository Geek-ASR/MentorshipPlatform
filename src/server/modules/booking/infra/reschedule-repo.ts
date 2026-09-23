import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { toTstzRange } from "@/server/platform/db/sql-helpers";
import { rescheduleRequests } from "./tables";
import type { RescheduleStatus } from "../domain/types";

export type RescheduleRequestRow = typeof rescheduleRequests.$inferSelect;

export async function countSelfServiceReschedules(
  executor: Executor,
  bookingId: string,
): Promise<number> {
  const rows = await executor
    .select({ id: rescheduleRequests.id })
    .from(rescheduleRequests)
    .where(
      and(eq(rescheduleRequests.bookingId, bookingId), eq(rescheduleRequests.status, "accepted")),
    );
  return rows.length;
}

export async function insertRescheduleRequest(
  executor: Executor,
  input: {
    bookingId: string;
    requestedBy: "student" | "mentor";
    start: Date;
    end: Date;
    status: RescheduleStatus;
    expiresAt: Date | null;
  },
): Promise<RescheduleRequestRow> {
  const [row] = await executor
    .insert(rescheduleRequests)
    .values({
      id: newId(),
      bookingId: input.bookingId,
      requestedBy: input.requestedBy,
      proposedDuring: toTstzRange(input.start, input.end),
      status: input.status,
      expiresAt: input.expiresAt,
    })
    .returning();
  return row!;
}

export async function findPendingReschedule(
  executor: Executor,
  bookingId: string,
): Promise<RescheduleRequestRow | undefined> {
  const [row] = await executor
    .select()
    .from(rescheduleRequests)
    .where(
      and(eq(rescheduleRequests.bookingId, bookingId), eq(rescheduleRequests.status, "pending")),
    )
    .limit(1);
  return row;
}

export async function decideReschedule(
  executor: Executor,
  id: string,
  status: RescheduleStatus,
  now: Date,
): Promise<void> {
  await executor
    .update(rescheduleRequests)
    .set({ status, decidedAt: now })
    .where(eq(rescheduleRequests.id, id));
}

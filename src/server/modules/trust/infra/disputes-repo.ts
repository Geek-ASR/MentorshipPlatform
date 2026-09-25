import { desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { disputeEvidence, disputes } from "./tables";
import type { DisputeEvidenceKind, DisputeResolution, DisputeStatus } from "../domain/types";

export type DisputeRow = typeof disputes.$inferSelect;
export type DisputeEvidenceRow = typeof disputeEvidence.$inferSelect;

export async function insertDispute(
  executor: Executor,
  input: { bookingId: string; openedByUserId: string; openedAt: Date; evidenceDeadlineAt: Date },
): Promise<DisputeRow> {
  const [row] = await executor
    .insert(disputes)
    .values({
      id: newId(),
      status: "open",
      resolution: null,
      refundPct: null,
      atFaultUserId: null,
      decidedBy: null,
      resolvedAt: null,
      appealDeadlineAt: null,
      closedAt: null,
      ...input,
    })
    .returning();
  return row!;
}

export async function findDispute(executor: Executor, id: string): Promise<DisputeRow | undefined> {
  const [row] = await executor.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  return row;
}

export async function findDisputeByBooking(
  executor: Executor,
  bookingId: string,
): Promise<DisputeRow | undefined> {
  const [row] = await executor
    .select()
    .from(disputes)
    .where(eq(disputes.bookingId, bookingId))
    .limit(1);
  return row;
}

/** docs/06 §7.9 `GET /admin/disputes`. */
export async function listDisputes(
  executor: Executor,
  options: { status?: DisputeStatus } = {},
): Promise<DisputeRow[]> {
  const query = executor.select().from(disputes);
  const rows = options.status
    ? await query.where(eq(disputes.status, options.status)).orderBy(desc(disputes.openedAt))
    : await query.orderBy(desc(disputes.openedAt));
  return rows;
}

export async function setDisputeStatus(
  executor: Executor,
  id: string,
  status: DisputeStatus,
): Promise<void> {
  await executor.update(disputes).set({ status, updatedAt: new Date() }).where(eq(disputes.id, id));
}

export async function resolveDispute(
  executor: Executor,
  id: string,
  input: {
    resolution: DisputeResolution;
    refundPct: number;
    atFaultUserId: string | null;
    decidedBy: string;
    resolvedAt: Date;
    appealDeadlineAt: Date;
  },
): Promise<DisputeRow | undefined> {
  const [row] = await executor
    .update(disputes)
    .set({ status: "resolved", updatedAt: input.resolvedAt, ...input })
    .where(eq(disputes.id, id))
    .returning();
  return row;
}

export async function closeDispute(executor: Executor, id: string, now: Date): Promise<void> {
  await executor
    .update(disputes)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(eq(disputes.id, id));
}

export async function listOpenDisputesPastEvidenceDeadline(
  executor: Executor,
  now: Date,
): Promise<DisputeRow[]> {
  const rows = await executor
    .select()
    .from(disputes)
    .where(eq(disputes.status, "awaiting_evidence"));
  return rows.filter((r) => r.evidenceDeadlineAt !== null && r.evidenceDeadlineAt <= now);
}

export async function listResolvedDisputesPastAppealDeadline(
  executor: Executor,
  now: Date,
): Promise<DisputeRow[]> {
  const rows = await executor.select().from(disputes).where(eq(disputes.status, "resolved"));
  return rows.filter((r) => r.appealDeadlineAt !== null && r.appealDeadlineAt <= now);
}

export async function insertDisputeEvidence(
  executor: Executor,
  input: {
    disputeId: string;
    submittedByUserId: string;
    kind: DisputeEvidenceKind;
    content: string | null;
  },
): Promise<DisputeEvidenceRow> {
  const [row] = await executor
    .insert(disputeEvidence)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function listEvidenceForDispute(
  executor: Executor,
  disputeId: string,
): Promise<DisputeEvidenceRow[]> {
  return executor.select().from(disputeEvidence).where(eq(disputeEvidence.disputeId, disputeId));
}

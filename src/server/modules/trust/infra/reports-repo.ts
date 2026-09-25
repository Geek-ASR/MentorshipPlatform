import { and, desc, eq, gte } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { reports } from "./tables";
import type { ReportReasonCode, ReportTargetType } from "../domain/types";

export type ReportRow = typeof reports.$inferSelect;

export async function insertReport(
  executor: Executor,
  input: {
    reporterUserId: string;
    targetType: ReportTargetType;
    targetId: string;
    reasonCode: ReportReasonCode;
    details: string | null;
  },
): Promise<ReportRow> {
  const [row] = await executor
    .insert(reports)
    .values({ id: newId(), caseId: null, ...input })
    .returning();
  return row!;
}

/** Same-reporter-same-target dedup within a window (docs/10 §7.1's 30-day case-grouping window is
 * for *cases*; this is this phase's own narrower per-reporter guard, see the Phase 10 ADR). */
export async function findRecentReportByReporter(
  executor: Executor,
  reporterUserId: string,
  targetType: ReportTargetType,
  targetId: string,
  since: Date,
): Promise<ReportRow | undefined> {
  const [row] = await executor
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.reporterUserId, reporterUserId),
        eq(reports.targetType, targetType),
        eq(reports.targetId, targetId),
        gte(reports.createdAt, since),
      ),
    )
    .limit(1);
  return row;
}

export async function attachReportToCase(
  executor: Executor,
  reportId: string,
  caseId: string,
): Promise<void> {
  await executor.update(reports).set({ caseId }).where(eq(reports.id, reportId));
}

export async function listReportsForCase(executor: Executor, caseId: string): Promise<ReportRow[]> {
  return executor.select().from(reports).where(eq(reports.caseId, caseId));
}

export async function findReport(executor: Executor, id: string): Promise<ReportRow | undefined> {
  const [row] = await executor.select().from(reports).where(eq(reports.id, id)).limit(1);
  return row;
}

/** docs/06 §7.9 `GET /admin/reports` — most recent reports across every target, for staff triage. */
export async function listRecentReports(executor: Executor, limit: number): Promise<ReportRow[]> {
  return executor.select().from(reports).orderBy(desc(reports.createdAt)).limit(limit);
}

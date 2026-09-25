import type { Database } from "@/server/platform/db/client";
import { writeAudit } from "@/server/platform/audit";
import type { ReportReasonCode, ReportTargetType } from "../domain/types";
import {
  attachReportToCase,
  findRecentReportByReporter,
  insertReport,
  listReportsForCase,
  listRecentReports as listRecentReportsRow,
  type ReportRow,
} from "../infra/reports-repo";
import { addCaseEvent, findOpenCaseForTarget, insertCase } from "../infra/moderation-repo";

/** This phase's own reporter-level dedup guard (docs/10 §7.1 doesn't specify one — see the Phase 10
 * ADR) — just enough to absorb a double-click or a frustrated repeat submission without silently
 * dropping a genuinely new report of the same target weeks later. */
const REPORTER_DEDUP_WINDOW_DAYS = 1;

export type CreateReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReasonCode;
  details?: string;
};

/**
 * docs/10 §7.1: always acknowledges (never an existence oracle — a report against a target that
 * doesn't exist still returns the same acknowledgement, and this function itself never 404s).
 * Reports on the same target within 30 days group into one open case (docs/10 §7.2).
 */
export async function createReport(
  db: Database,
  reporterUserId: string,
  input: CreateReportInput,
): Promise<{ reportId: string }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const dedupSince = new Date(now.getTime() - REPORTER_DEDUP_WINDOW_DAYS * 86_400_000);
    const existing = await findRecentReportByReporter(
      tx,
      reporterUserId,
      input.targetType,
      input.targetId,
      dedupSince,
    );
    if (existing) return { reportId: existing.id };

    const report = await insertReport(tx, {
      reporterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      reasonCode: input.reasonCode,
      details: input.details ?? null,
    });

    // docs/10 §7.2: "reports on the same target within 30 days group into one case" — an already-
    // open case absorbs new reports regardless of its own age (it hasn't been resolved yet, so
    // there's nothing to "regroup" into); once a case closes, the next report starts a fresh one.
    let openCase = await findOpenCaseForTarget(tx, input.targetType, input.targetId);
    if (!openCase) {
      openCase = await insertCase(tx, {
        targetType: input.targetType,
        targetId: input.targetId,
        proposedByRuleId: null,
      });
    }
    await attachReportToCase(tx, report.id, openCase.id);
    await addCaseEvent(tx, {
      caseId: openCase.id,
      kind: "report_added",
      payload: { reportId: report.id, reasonCode: input.reasonCode },
    });

    await writeAudit(tx, {
      actorType: "user",
      actorUserId: reporterUserId,
      action: "trust.report_filed",
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: { reasonCode: input.reasonCode, caseId: openCase.id },
    });

    return { reportId: report.id };
  });
}

export async function listReportsForModerationCase(
  db: Database,
  caseId: string,
): Promise<ReportRow[]> {
  return listReportsForCase(db, caseId);
}

export async function listRecentReports(db: Database, limit = 50): Promise<ReportRow[]> {
  return listRecentReportsRow(db, limit);
}

import type { Database, Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import type { Capability } from "@/server/platform/authz/actor";
import { listRestrictionRowsForUser, toActiveRestrictions } from "@/server/modules/auth";
import type { ModerationActionType, ModerationCaseStatus, ReportTargetType } from "../domain/types";
import {
  addCaseEvent,
  assignCase,
  findAction,
  findCase,
  listActionsForSubject,
  listCaseEvents,
  listCases,
  setCaseStatus,
  type ModerationActionRow,
  type ModerationCaseEventRow,
  type ModerationCaseRow,
} from "../infra/moderation-repo";
import { findAppealForAction } from "../infra/appeals-repo";
import { listReportsForCase, type ReportRow } from "../infra/reports-repo";
import { findReview, findReviewResponseById } from "../infra/reviews-repo";
import { excuseTrustEvent, findTrustEvent, type TrustEventRow } from "../infra/trust-events-repo";
import { applyModerationAction, reverseModerationAction } from "./enforcement";
import { recordTrustEvent } from "./trust-event-recording";

/** A case's `targetId` is only a user id when `targetType === "user"` — for content targets it's the
 * content's own id, and the actual sanctioned party is that content's author. Only the target types
 * this phase's own code ever opens cases against are resolved; any other `ReportTargetType` reaching
 * a decision throws rather than silently misusing a content id as a user id. */
async function resolveSubjectUserId(
  executor: Executor,
  targetType: ReportTargetType,
  targetId: string,
): Promise<string> {
  if (targetType === "user") return targetId;
  if (targetType === "review") {
    const review = await findReview(executor, targetId);
    if (!review) throw new AppError("NOT_FOUND");
    return review.authorUserId;
  }
  if (targetType === "review_response") {
    const response = await findReviewResponseById(executor, targetId);
    if (!response) throw new AppError("NOT_FOUND");
    return response.mentorUserId;
  }
  throw new AppError("VALIDATION_FAILED", {
    detail: `Deciding a case for target type "${targetType}" isn't supported yet.`,
  });
}

export async function assignCaseToStaff(
  db: Database,
  caseId: string,
  staffUserId: string,
): Promise<void> {
  const row = await findCase(db, caseId);
  if (!row) throw new AppError("NOT_FOUND");
  await assignCase(db, caseId, staffUserId);
  await addCaseEvent(db, {
    caseId,
    kind: "assigned",
    payload: { staffUserId },
  });
}

export type CaseDetail = {
  case: ModerationCaseRow;
  reports: ReportRow[];
  events: ModerationCaseEventRow[];
  priorActions: ModerationActionRow[];
};

export async function getCaseDetail(db: Database, caseId: string): Promise<CaseDetail> {
  const row = await findCase(db, caseId);
  if (!row) throw new AppError("NOT_FOUND");
  const subjectUserId =
    row.targetType === "user"
      ? row.targetId
      : await resolveSubjectUserId(db, row.targetType, row.targetId).catch(() => null);
  const [reports, events, priorActions] = await Promise.all([
    listReportsForCase(db, caseId),
    listCaseEvents(db, caseId),
    subjectUserId ? listActionsForSubject(db, subjectUserId) : Promise.resolve([]),
  ]);
  return { case: row, reports, events, priorActions };
}

export async function listModerationCases(
  db: Database,
  options: { status?: ModerationCaseStatus } = {},
): Promise<ModerationCaseRow[]> {
  return listCases(db, options);
}

export type DecideCaseInput = {
  caseId: string;
  action: ModerationActionType;
  restrictions: Capability[];
  durationDays: number | null;
  reasonCode: string;
  rationale: string | null;
  decidedBy: string;
  secondReviewerId: string | null;
  /** Passed through when staff's decision matches a `policy_proposed` case event's own proposal
   * (docs/10 §7.2) — lets an appeal later excuse exactly the events that triggered it. Omitted for
   * cases opened from a user report, which has no trust-event trigger to excuse. */
  contributingEventIds?: string[];
  /** Set when this decision confirms ("upholds") a report the case was opened from (docs/10 §4.2:
   * `report_upheld_minor`/`report_upheld_major` are "created when" a policy violation report is
   * confirmed) — records the matching trust event against the subject. Omitted for a
   * policy-engine-proposed case (already has its own trust-event trail) or a decision that doesn't
   * confirm a reported violation. */
  upheldSeverity?: "minor" | "major";
};

/**
 * The manual staff-decision path (docs/10 §7.2 "case -> decision -> action") — any of the seven
 * action types, unlike the policy engine's auto-apply path which is restricted to `warn`/`restrict`
 * (that restriction lives in the pure evaluator, not here; see `enforcement.ts`'s docstring).
 */
export async function decideCase(
  db: Database,
  input: DecideCaseInput,
  now: Date,
): Promise<ModerationActionRow> {
  return db.transaction(async (tx) => {
    const row = await findCase(tx, input.caseId);
    if (!row) throw new AppError("NOT_FOUND");
    if (row.status === "closed") {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "This case is already closed." });
    }

    const subjectUserId = await resolveSubjectUserId(tx, row.targetType, row.targetId);

    const action = await applyModerationAction(
      tx,
      {
        subjectUserId,
        action: input.action,
        restrictions: input.restrictions,
        durationDays: input.durationDays,
        reasonCode: input.reasonCode,
        rationale: input.rationale,
        caseId: input.caseId,
        decidedBy: input.decidedBy,
        secondReviewerId: input.secondReviewerId,
        contributingEventIds: input.contributingEventIds,
      },
      now,
    );

    if (input.upheldSeverity) {
      await recordTrustEvent(
        tx,
        {
          subjectUserId,
          type: input.upheldSeverity === "major" ? "report_upheld_major" : "report_upheld_minor",
          sourceType: "moderation_case",
          sourceId: input.caseId,
        },
        now,
      );
    }

    await setCaseStatus(tx, input.caseId, "closed", now);
    await addCaseEvent(tx, {
      caseId: input.caseId,
      kind: "decided",
      payload: { action: input.action, actionId: action.id, decidedBy: input.decidedBy },
    });

    return action;
  });
}

/** docs/10 §7.1: the reporter's two possible outcomes are "action taken / no violation found" — this
 * is the second one, closing a case with no `moderation_actions` row and no trust event. */
export async function dismissCase(
  db: Database,
  caseId: string,
  dismissedBy: string,
  rationale: string,
  now: Date,
): Promise<void> {
  return db.transaction(async (tx) => {
    const row = await findCase(tx, caseId);
    if (!row) throw new AppError("NOT_FOUND");
    if (row.status === "closed") {
      throw new AppError("INVALID_STATE_TRANSITION", { detail: "This case is already closed." });
    }
    await setCaseStatus(tx, caseId, "closed", now);
    await addCaseEvent(tx, { caseId, kind: "dismissed", payload: { dismissedBy, rationale } });
    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: dismissedBy,
      action: "trust.case_dismissed",
      targetType: "moderation_case",
      targetId: caseId,
      metadata: { rationale },
    });
  });
}

/** docs/06 §7.9 `POST /admin/moderation-actions/{id}/revoke` — a direct staff undo, distinct from
 * the appeals flow (no appellant statement, no "review by a different staff member" requirement).
 * Reuses the same reversal semantics an overturned appeal uses. */
export async function revokeModerationAction(
  db: Database,
  actionId: string,
  revokedBy: string,
  rationale: string,
  now: Date,
): Promise<void> {
  return db.transaction(async (tx) => {
    const action = await findAction(tx, actionId);
    if (!action) throw new AppError("NOT_FOUND");
    await reverseModerationAction(tx, action, now, `revoked:${actionId}`);
    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: revokedBy,
      action: "trust.moderation_action_revoked",
      targetType: "moderation_action",
      targetId: actionId,
      metadata: { rationale },
    });
  });
}

/** docs/06 §7.9 `POST /admin/trust-events/{id}/excuse` — a moderator marking one event as excused
 * (docs/10 §4.2: emergencies and platform failures never count against users), independent of any
 * moderation action or appeal. Does not retroactively undo an action that already fired off this
 * event — only appeal/revoke reaches back that far. */
export async function excuseTrustEventById(
  db: Database,
  eventId: string,
  excusedBy: string,
  reason: string,
): Promise<TrustEventRow> {
  return db.transaction(async (tx) => {
    const existing = await findTrustEvent(tx, eventId);
    if (!existing) throw new AppError("NOT_FOUND");
    const updated = await excuseTrustEvent(tx, eventId, reason);
    if (!updated) throw new AppError("NOT_FOUND");
    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: excusedBy,
      action: "trust.trust_event_excused",
      targetType: "trust_event",
      targetId: eventId,
      metadata: { reason },
    });
    return updated;
  });
}

export type MyEnforcementStatus = {
  restrictions: ReturnType<typeof toActiveRestrictions>;
  actions: ModerationActionRow[];
  appealableActionIds: string[];
};

/** docs/06 §7.8 `GET /me/enforcement` — a user's own active restrictions, action history and which
 * of those actions can still be appealed (docs/10 §7.4: one appeal per action, within 30 days). */
export async function getMyEnforcementStatus(
  db: Database,
  userId: string,
  now: Date,
): Promise<MyEnforcementStatus> {
  const APPEAL_WINDOW_DAYS = 30;
  const [restrictionRows, actions] = await Promise.all([
    listRestrictionRowsForUser(db, userId),
    listActionsForSubject(db, userId),
  ]);

  const appealableActionIds: string[] = [];
  for (const action of actions) {
    const withinWindow =
      now.getTime() - action.createdAt.getTime() <= APPEAL_WINDOW_DAYS * 86_400_000;
    if (!withinWindow) continue;
    const existing = await findAppealForAction(db, action.id);
    if (!existing) appealableActionIds.push(action.id);
  }

  return {
    restrictions: toActiveRestrictions(restrictionRows, now),
    actions,
    appealableActionIds,
  };
}

import { and, desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { moderationActions, moderationCaseEvents, moderationCases } from "./tables";
import type { ModerationActionType, ModerationCaseStatus, ReportTargetType } from "../domain/types";

export type ModerationCaseRow = typeof moderationCases.$inferSelect;
export type ModerationCaseEventRow = typeof moderationCaseEvents.$inferSelect;
export type ModerationActionRow = typeof moderationActions.$inferSelect;

export async function insertCase(
  executor: Executor,
  input: { targetType: ReportTargetType; targetId: string; proposedByRuleId: string | null },
): Promise<ModerationCaseRow> {
  const [row] = await executor
    .insert(moderationCases)
    .values({ id: newId(), status: "open", assignedTo: null, closedAt: null, ...input })
    .returning();
  return row!;
}

export async function findOpenCaseForTarget(
  executor: Executor,
  targetType: ReportTargetType,
  targetId: string,
): Promise<ModerationCaseRow | undefined> {
  const [row] = await executor
    .select()
    .from(moderationCases)
    .where(
      and(
        eq(moderationCases.targetType, targetType),
        eq(moderationCases.targetId, targetId),
        eq(moderationCases.status, "open"),
      ),
    )
    .limit(1);
  return row;
}

/** For the policy evaluator's idempotency check (docs/10 §4.3) — an open case OR action already
 * proposed/applied by this exact rule for this subject means don't propose again. */
export async function hasOpenProposalForRule(
  executor: Executor,
  ruleId: string,
  subjectUserId: string,
): Promise<boolean> {
  const [caseRow] = await executor
    .select({ id: moderationCases.id })
    .from(moderationCases)
    .where(
      and(
        eq(moderationCases.proposedByRuleId, ruleId),
        eq(moderationCases.targetId, subjectUserId),
        eq(moderationCases.status, "open"),
      ),
    )
    .limit(1);
  return caseRow !== undefined;
}

export async function findCase(
  executor: Executor,
  id: string,
): Promise<ModerationCaseRow | undefined> {
  const [row] = await executor
    .select()
    .from(moderationCases)
    .where(eq(moderationCases.id, id))
    .limit(1);
  return row;
}

export async function listCases(
  executor: Executor,
  options: { status?: ModerationCaseStatus } = {},
): Promise<ModerationCaseRow[]> {
  const query = executor.select().from(moderationCases);
  const rows = options.status
    ? await query
        .where(eq(moderationCases.status, options.status))
        .orderBy(desc(moderationCases.openedAt))
    : await query.orderBy(desc(moderationCases.openedAt));
  return rows;
}

export async function assignCase(
  executor: Executor,
  id: string,
  assignedTo: string,
): Promise<void> {
  await executor
    .update(moderationCases)
    .set({ status: "assigned", assignedTo, updatedAt: new Date() })
    .where(eq(moderationCases.id, id));
}

export async function setCaseStatus(
  executor: Executor,
  id: string,
  status: ModerationCaseStatus,
  now: Date,
): Promise<void> {
  await executor
    .update(moderationCases)
    .set({ status, updatedAt: now, closedAt: status === "closed" ? now : undefined })
    .where(eq(moderationCases.id, id));
}

export async function addCaseEvent(
  executor: Executor,
  input: { caseId: string; kind: string; payload: Record<string, unknown> },
): Promise<void> {
  await executor.insert(moderationCaseEvents).values({ id: newId(), ...input });
}

export async function listCaseEvents(
  executor: Executor,
  caseId: string,
): Promise<ModerationCaseEventRow[]> {
  return executor
    .select()
    .from(moderationCaseEvents)
    .where(eq(moderationCaseEvents.caseId, caseId))
    .orderBy(moderationCaseEvents.createdAt);
}

export async function insertAction(
  executor: Executor,
  input: {
    subjectUserId: string;
    action: ModerationActionType;
    restrictionScope: Record<string, unknown>;
    startsAt: Date;
    endsAt: Date | null;
    reasonCode: string;
    rationale: string | null;
    caseId: string | null;
    decidedBy: string | null;
    secondReviewerId: string | null;
  },
): Promise<ModerationActionRow> {
  const [row] = await executor
    .insert(moderationActions)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function findAction(
  executor: Executor,
  id: string,
): Promise<ModerationActionRow | undefined> {
  const [row] = await executor
    .select()
    .from(moderationActions)
    .where(eq(moderationActions.id, id))
    .limit(1);
  return row;
}

export async function listActionsForSubject(
  executor: Executor,
  subjectUserId: string,
): Promise<ModerationActionRow[]> {
  return executor
    .select()
    .from(moderationActions)
    .where(eq(moderationActions.subjectUserId, subjectUserId))
    .orderBy(desc(moderationActions.createdAt));
}

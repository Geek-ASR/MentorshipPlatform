import type { Executor } from "@/server/platform/db/client";
import {
  listBookingsForMentor,
  listBookingsForStudent,
  sessionWindow,
  type BookingWithSession,
} from "@/server/modules/booking";
import {
  evaluatePolicyRule,
  type PolicyRuleBody,
  type SessionRateFact,
  type TrustEventFact,
} from "../domain/policy-evaluator";
import {
  addCaseEvent,
  hasOpenProposalForRule,
  insertCase,
  listActionsForSubject,
  type ModerationActionRow,
} from "../infra/moderation-repo";
import { listEnabledRulesForSubject } from "../infra/policy-rules-repo";
import { listRecentEventsForSubject, type TrustEventRow } from "../infra/trust-events-repo";
import { applyModerationAction } from "./enforcement";

const PROBATION_DAYS = 90;

/** A subject is "on probation" for `PROBATION_DAYS` after coming back from a `reinstate` decision
 * (docs/10 §5 "probation period of 90 days where Level 3 thresholds are halved") — the docs don't
 * further define what starts probation, so this phase's own reading is: a person who was just
 * reinstated is the one case probation obviously applies to. Re-evaluated fresh every engine run,
 * not stored as its own column. */
function isOnProbation(actions: readonly ModerationActionRow[], now: Date): boolean {
  const latest = actions[0]; // listActionsForSubject already orders desc by createdAt.
  if (!latest || latest.action !== "reinstate") return false;
  return now.getTime() - latest.createdAt.getTime() <= PROBATION_DAYS * 86_400_000;
}

function toFact(row: TrustEventRow): TrustEventFact {
  return {
    id: row.id,
    type: row.type,
    points: row.points,
    occurredAt: row.occurredAt,
    excused: row.excused,
    expiresAt: row.expiresAt,
  };
}

function ruleNeedsRateFact(body: PolicyRuleBody): boolean {
  return body.anyOf.some((c) => c.kind === "rate_gte");
}

async function computeSessionRateFact(
  executor: Executor,
  subjectUserId: string,
  subjectRole: "mentor" | "student",
  windowDays: number,
  now: Date,
): Promise<SessionRateFact> {
  const endedStatuses = [
    "completed",
    "no_show_mentor",
    "no_show_student",
    "resolved_refunded",
    "disputed",
  ] as const;
  const rows: BookingWithSession[] =
    subjectRole === "mentor"
      ? await listBookingsForMentor(executor, subjectUserId, { statuses: [...endedStatuses] })
      : await listBookingsForStudent(executor, subjectUserId, { statuses: [...endedStatuses] });

  const windowStart = now.getTime() - windowDays * 86_400_000;
  const inWindow = rows.filter((row) => sessionWindow(row.session).end.getTime() >= windowStart);
  const noShowStatus = subjectRole === "mentor" ? "no_show_mentor" : "no_show_student";
  const noShowCount = inWindow.filter((row) => row.status === noShowStatus).length;
  return { noShowCount, totalSessions: inWindow.length };
}

export type PolicyEngineOutcome = {
  ruleKey: string;
  applied: boolean; // true = auto-applied immediately, false = case opened for staff review.
  actionId?: string;
  caseId?: string;
};

/**
 * Runs every enabled rule for one subject/role ladder (docs/10 §4.1/§5/§6) and, for each that
 * triggers, either auto-applies (warn/restrict only — enforced inside the pure evaluator itself) or
 * opens a moderation case for staff to decide. Deliberately evaluates every enabled rule in one pass
 * rather than stopping at the first match: docs/10's ladder is expressed as independent rules with
 * their own idempotency guard (`hasOpenProposalForRule`), not a single first-match cascade, so two
 * different thresholds crossed in the same tick both get recorded.
 */
export async function runPolicyEngineForSubject(
  executor: Executor,
  subjectUserId: string,
  subjectRole: "mentor" | "student",
  now: Date,
): Promise<PolicyEngineOutcome[]> {
  const rules = await listEnabledRulesForSubject(executor, subjectRole);
  if (rules.length === 0) return [];

  const maxWindowDays = Math.max(
    ...rules.map((r) => (r.ruleBody as unknown as PolicyRuleBody).windowDays),
  );
  const [eventRows, priorActions] = await Promise.all([
    listRecentEventsForSubject(executor, subjectUserId, maxWindowDays, now),
    listActionsForSubject(executor, subjectUserId),
  ]);
  const events = eventRows.map(toFact);
  const probation = isOnProbation(priorActions, now);

  const outcomes: PolicyEngineOutcome[] = [];
  const rateFactCache = new Map<number, SessionRateFact>();

  for (const rule of rules) {
    const body = rule.ruleBody as unknown as PolicyRuleBody;
    const hasOpenProposal = await hasOpenProposalForRule(executor, rule.id, subjectUserId);

    let rate: SessionRateFact | undefined;
    if (ruleNeedsRateFact(body)) {
      if (!rateFactCache.has(body.windowDays)) {
        rateFactCache.set(
          body.windowDays,
          await computeSessionRateFact(executor, subjectUserId, subjectRole, body.windowDays, now),
        );
      }
      rate = rateFactCache.get(body.windowDays);
    }

    const result = evaluatePolicyRule(body, {
      now,
      events,
      rate,
      probation,
      hasOpenProposalForRule: hasOpenProposal,
    });
    if (!result.triggered) continue;

    if (result.autoApply) {
      const action = await applyModerationAction(
        executor,
        {
          subjectUserId,
          action: result.action,
          restrictions: result.restrictions,
          durationDays: result.durationDays,
          reasonCode: rule.ruleKey,
          rationale: `Automatically applied by policy rule "${rule.ruleKey}".`,
          caseId: null,
          decidedBy: null,
          secondReviewerId: null,
          contributingEventIds: result.contributingEventIds,
        },
        now,
      );
      outcomes.push({ ruleKey: rule.ruleKey, applied: true, actionId: action.id });
    } else {
      const openedCase = await insertCase(executor, {
        targetType: "user",
        targetId: subjectUserId,
        proposedByRuleId: rule.id,
      });
      await addCaseEvent(executor, {
        caseId: openedCase.id,
        kind: "policy_proposed",
        payload: {
          ruleKey: rule.ruleKey,
          action: result.action,
          restrictions: result.restrictions,
          durationDays: result.durationDays,
          matchedCondition: result.matchedCondition,
          contributingEventIds: result.contributingEventIds,
        },
      });
      await addCaseEvent(executor, {
        caseId: openedCase.id,
        kind: "opened",
        payload: { proposedByRuleId: rule.id },
      });
      outcomes.push({ ruleKey: rule.ruleKey, applied: false, caseId: openedCase.id });
    }
  }

  return outcomes;
}

/**
 * A new trust event can be relevant to either ladder regardless of which subject the catalog names
 * it for (docs/10 §4.2's `any`-subject events like `report_upheld_major` clearly apply whichever hat
 * the person was wearing) — rather than look up the subject's current account roles, this just runs
 * both ladders unconditionally. A person with zero mentor-specific events never trips a mentor-only
 * `count_type_gte` condition, so running the mentor ladder against a pure student is harmless.
 */
export async function runPolicyEngineForBothLadders(
  executor: Executor,
  subjectUserId: string,
  now: Date,
): Promise<PolicyEngineOutcome[]> {
  const [mentorOutcomes, studentOutcomes] = await Promise.all([
    runPolicyEngineForSubject(executor, subjectUserId, "mentor", now),
    runPolicyEngineForSubject(executor, subjectUserId, "student", now),
  ]);
  return [...mentorOutcomes, ...studentOutcomes];
}

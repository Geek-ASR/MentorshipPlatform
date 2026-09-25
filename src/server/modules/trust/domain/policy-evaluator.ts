import type { Capability } from "@/server/platform/authz/actor";
import {
  AUTO_APPLICABLE_ACTION_TYPES,
  type ModerationActionType,
  type TrustEventType,
} from "./types";

/**
 * The policy evaluator (docs/10 §4.1/§4.3, ADR-016) — a pure function over trust-event facts and a
 * rule definition, producing at most one proposed action. No I/O: the caller loads events (already
 * scoped to one subject), checks for an existing open proposal (idempotency), and computes any
 * session-rate fact from booking data this function has no way to see.
 */
export type TrustEventFact = {
  id: string;
  type: TrustEventType;
  points: number;
  occurredAt: Date;
  excused: boolean;
  /** null = never decays. */
  expiresAt: Date | null;
};

export type SessionRateFact = {
  /** e.g. no-shows within the last `minSessions`-sized window, pre-computed by the caller — the
   * evaluator has no session data of its own, only trust events. */
  noShowCount: number;
  totalSessions: number;
};

export type PolicyCondition =
  | { kind: "sum_points_gte"; value: number }
  | { kind: "count_type_gte"; eventType: TrustEventType; value: number }
  | { kind: "rate_gte"; ratePct: number; minSessions: number };

export type PolicyRuleBody = {
  windowDays: number;
  anyOf: PolicyCondition[];
  action: ModerationActionType;
  durationDays: number | null;
  restrictions: Capability[];
  autoApply: boolean;
  requiresSecondReviewer: boolean;
  notifyTemplate: string;
};

export type PolicyEvaluationInput = {
  now: Date;
  /** Every trust event for this rule's subject — filtering to window/decay/excusal happens here. */
  events: readonly TrustEventFact[];
  rate?: SessionRateFact;
  /** docs/10 §5 "probation period of 90 days where Level 3 thresholds are halved" — applies to every
   * numeric threshold in the rule, not just Level 3 specifically, since the evaluator has no notion
   * of "which level" a rule represents; the caller only ever sets this for rules it knows to be
   * probation-sensitive. */
  probation: boolean;
  /** True when an open case or active action already exists for this rule + subject + window
   * (docs/10 §4.3 "idempotent: doesn't create duplicates") — computed by the caller from
   * `moderation_cases`/`moderation_actions`, not something this pure function can know. */
  hasOpenProposalForRule: boolean;
};

export type PolicyEvaluationResult =
  | { triggered: false }
  | {
      triggered: true;
      /** The evaluator's own hard invariant (docs/19 Phase 10 exit criterion): even a misconfigured
       * rule with `autoApply: true` on `suspend`/`ban`/`hide_profile`/`remove_content` can never
       * auto-execute — only `warn`/`restrict` ever can. */
      autoApply: boolean;
      action: ModerationActionType;
      durationDays: number | null;
      restrictions: Capability[];
      notifyTemplate: string;
      matchedCondition: PolicyCondition;
      /** The specific live trust-event ids that fed the matched condition — empty for `rate_gte`,
       * which is derived from booking session counts rather than discrete events. Lets an overturned
       * appeal excuse exactly the events that triggered this action (docs/10 §7.4), rather than
       * every event ever recorded for the subject. */
      contributingEventIds: string[];
    };

function halved(value: number): number {
  return Math.ceil(value / 2);
}

function inWindow(fact: TrustEventFact, now: Date, windowDays: number): boolean {
  const windowStart = now.getTime() - windowDays * 86_400_000;
  return fact.occurredAt.getTime() >= windowStart;
}

function isLive(fact: TrustEventFact, now: Date): boolean {
  if (fact.excused) return false;
  if (fact.expiresAt !== null && fact.expiresAt <= now) return false;
  return true;
}

function conditionMet(
  condition: PolicyCondition,
  liveEvents: readonly TrustEventFact[],
  rate: SessionRateFact | undefined,
  probation: boolean,
): boolean {
  switch (condition.kind) {
    case "sum_points_gte": {
      const threshold = probation ? halved(condition.value) : condition.value;
      const sum = liveEvents.reduce((total, e) => total + e.points, 0);
      return sum >= threshold;
    }
    case "count_type_gte": {
      const threshold = probation ? halved(condition.value) : condition.value;
      const count = liveEvents.filter((e) => e.type === condition.eventType).length;
      return count >= threshold;
    }
    case "rate_gte": {
      if (!rate) return false;
      const minSessions = probation ? halved(condition.minSessions) : condition.minSessions;
      if (rate.totalSessions < minSessions) return false;
      const ratePct = probation ? condition.ratePct / 2 : condition.ratePct;
      return (rate.noShowCount / rate.totalSessions) * 100 >= ratePct;
    }
  }
}

/** Every live event that counted toward the matched condition — see `contributingEventIds`. */
function contributingIdsFor(
  condition: PolicyCondition,
  liveEvents: readonly TrustEventFact[],
): string[] {
  switch (condition.kind) {
    case "sum_points_gte":
      return liveEvents.map((e) => e.id);
    case "count_type_gte":
      return liveEvents.filter((e) => e.type === condition.eventType).map((e) => e.id);
    case "rate_gte":
      return [];
  }
}

export function evaluatePolicyRule(
  rule: PolicyRuleBody,
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  if (input.hasOpenProposalForRule) return { triggered: false };

  const liveEvents = input.events.filter(
    (fact) => isLive(fact, input.now) && inWindow(fact, input.now, rule.windowDays),
  );

  const matched = rule.anyOf.find((condition) =>
    conditionMet(condition, liveEvents, input.rate, input.probation),
  );
  if (!matched) return { triggered: false };

  return {
    triggered: true,
    autoApply: rule.autoApply && AUTO_APPLICABLE_ACTION_TYPES.has(rule.action),
    action: rule.action,
    durationDays: rule.durationDays,
    restrictions: rule.restrictions,
    notifyTemplate: rule.notifyTemplate,
    matchedCondition: matched,
    contributingEventIds: contributingIdsFor(matched, liveEvents),
  };
}

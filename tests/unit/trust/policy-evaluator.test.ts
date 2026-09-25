import { describe, expect, it } from "vitest";
import {
  evaluatePolicyRule,
  type PolicyRuleBody,
  type TrustEventFact,
} from "@/server/modules/trust/domain/policy-evaluator";

const NOW = new Date("2026-06-01T00:00:00Z");
const DAY = 86_400_000;

function fact(overrides: Partial<TrustEventFact> = {}): TrustEventFact {
  return {
    id: overrides.id ?? "event-1",
    type: "mentor_no_show",
    points: 3,
    occurredAt: NOW,
    excused: false,
    expiresAt: null,
    ...overrides,
  };
}

function rule(overrides: Partial<PolicyRuleBody> = {}): PolicyRuleBody {
  return {
    windowDays: 90,
    anyOf: [{ kind: "sum_points_gte", value: 9 }],
    action: "restrict",
    durationDays: 30,
    restrictions: [],
    autoApply: true,
    requiresSecondReviewer: false,
    notifyTemplate: "test",
    ...overrides,
  };
}

describe("evaluatePolicyRule: sum_points_gte", () => {
  it("triggers once the sum of live events meets the threshold", () => {
    const events = [fact({ id: "a", points: 4 }), fact({ id: "b", points: 5 })];
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 9 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.contributingEventIds.sort()).toEqual(["a", "b"]);
    }
  });

  it("does not trigger one point short of the threshold", () => {
    const events = [fact({ id: "a", points: 4 }), fact({ id: "b", points: 4 })];
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 9 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(false);
  });
});

describe("evaluatePolicyRule: count_type_gte", () => {
  it("triggers on the count of a specific event type, ignoring other types", () => {
    const events = [
      fact({ id: "a", type: "mentor_no_show" }),
      fact({ id: "b", type: "mentor_no_show" }),
      fact({ id: "c", type: "mentor_late_cancel_2h" }),
    ];
    const result = evaluatePolicyRule(
      rule({ anyOf: [{ kind: "count_type_gte", eventType: "mentor_no_show", value: 2 }] }),
      { now: NOW, events, probation: false, hasOpenProposalForRule: false },
    );
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.contributingEventIds.sort()).toEqual(["a", "b"]);
    }
  });

  it("does not count events of a different type toward the threshold", () => {
    const events = [fact({ id: "a", type: "mentor_late_cancel_2h" })];
    const result = evaluatePolicyRule(
      rule({ anyOf: [{ kind: "count_type_gte", eventType: "mentor_no_show", value: 1 }] }),
      { now: NOW, events, probation: false, hasOpenProposalForRule: false },
    );
    expect(result.triggered).toBe(false);
  });
});

describe("evaluatePolicyRule: rate_gte with min sessions", () => {
  const rateRule = rule({ anyOf: [{ kind: "rate_gte", ratePct: 10, minSessions: 10 }] });

  it("does not trigger below the minimum session floor even at a high rate", () => {
    const result = evaluatePolicyRule(rateRule, {
      now: NOW,
      events: [],
      rate: { noShowCount: 5, totalSessions: 5 }, // 100% rate, but only 5 sessions.
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(false);
  });

  it("triggers once both the session floor and the rate threshold are met", () => {
    const result = evaluatePolicyRule(rateRule, {
      now: NOW,
      events: [],
      rate: { noShowCount: 2, totalSessions: 10 }, // 20% >= 10%, 10 sessions meets the floor.
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(true);
  });

  it("does not trigger when the rate itself is under the threshold", () => {
    const result = evaluatePolicyRule(rateRule, {
      now: NOW,
      events: [],
      rate: { noShowCount: 1, totalSessions: 20 }, // 5% < 10%.
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(false);
  });

  it("never triggers when no rate fact is supplied", () => {
    const result = evaluatePolicyRule(rateRule, {
      now: NOW,
      events: [],
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(false);
  });

  it("produces no contributing event ids — the trigger comes from booking data, not trust events", () => {
    const result = evaluatePolicyRule(rateRule, {
      now: NOW,
      events: [],
      rate: { noShowCount: 5, totalSessions: 10 },
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(true);
    if (result.triggered) expect(result.contributingEventIds).toEqual([]);
  });
});

describe("evaluatePolicyRule: excused events", () => {
  it("excludes excused events from every condition kind", () => {
    const events = [
      fact({ id: "a", points: 9, excused: true }),
      fact({ id: "b", type: "mentor_no_show", excused: true }),
    ];
    const sumResult = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 1 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: false,
    });
    const countResult = evaluatePolicyRule(
      rule({ anyOf: [{ kind: "count_type_gte", eventType: "mentor_no_show", value: 1 }] }),
      { now: NOW, events, probation: false, hasOpenProposalForRule: false },
    );
    expect(sumResult.triggered).toBe(false);
    expect(countResult.triggered).toBe(false);
  });
});

describe("evaluatePolicyRule: decay (expiry)", () => {
  it("excludes an event whose expiresAt has already passed", () => {
    const events = [fact({ id: "a", points: 9, expiresAt: new Date(NOW.getTime() - DAY) })];
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 1 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(false);
  });

  it("includes an event whose expiresAt is still in the future", () => {
    const events = [fact({ id: "a", points: 9, expiresAt: new Date(NOW.getTime() + DAY) })];
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 1 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(true);
  });

  it("includes an event with a null expiresAt (never decays)", () => {
    const events = [fact({ id: "a", points: 9, expiresAt: null })];
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 1 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(true);
  });

  it("excludes an event that occurred before the rule's window", () => {
    const events = [fact({ id: "a", points: 9, occurredAt: new Date(NOW.getTime() - 91 * DAY) })];
    const result = evaluatePolicyRule(
      rule({ windowDays: 90, anyOf: [{ kind: "sum_points_gte", value: 1 }] }),
      {
        now: NOW,
        events,
        probation: false,
        hasOpenProposalForRule: false,
      },
    );
    expect(result.triggered).toBe(false);
  });

  it("includes an event exactly at the window boundary", () => {
    const events = [fact({ id: "a", points: 9, occurredAt: new Date(NOW.getTime() - 90 * DAY) })];
    const result = evaluatePolicyRule(
      rule({ windowDays: 90, anyOf: [{ kind: "sum_points_gte", value: 1 }] }),
      {
        now: NOW,
        events,
        probation: false,
        hasOpenProposalForRule: false,
      },
    );
    expect(result.triggered).toBe(true);
  });
});

describe("evaluatePolicyRule: idempotent proposals", () => {
  it("never triggers when an open proposal for this rule already exists, regardless of facts", () => {
    const events = [fact({ id: "a", points: 100 })];
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 1 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: true,
    });
    expect(result.triggered).toBe(false);
  });
});

describe("evaluatePolicyRule: probation halving", () => {
  it("halves a sum_points_gte threshold under probation", () => {
    const events = [fact({ id: "a", points: 5 })]; // Below 9, but >= ceil(9/2) = 5.
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 9 }] }), {
      now: NOW,
      events,
      probation: true,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(true);
  });

  it("halves a count_type_gte threshold under probation (rounding up)", () => {
    const events = [
      fact({ id: "a", type: "mentor_no_show" }),
      fact({ id: "b", type: "mentor_no_show" }),
    ];
    // threshold 3 halves to ceil(3/2) = 2 — met by exactly 2 events.
    const result = evaluatePolicyRule(
      rule({ anyOf: [{ kind: "count_type_gte", eventType: "mentor_no_show", value: 3 }] }),
      { now: NOW, events, probation: true, hasOpenProposalForRule: false },
    );
    expect(result.triggered).toBe(true);
  });

  it("halves both the rate percentage and the minimum-session floor under probation", () => {
    const rateRule = rule({ anyOf: [{ kind: "rate_gte", ratePct: 10, minSessions: 10 }] });
    // Floor halves to 5, rate halves to 5% — 1/10 = 10% meets a halved 5% threshold at 10 sessions,
    // but this checks the floor drop specifically: only 6 sessions, which fails the *unhalved* floor.
    const result = evaluatePolicyRule(rateRule, {
      now: NOW,
      events: [],
      rate: { noShowCount: 1, totalSessions: 6 },
      probation: true,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(true);
  });

  it("does not apply probation halving when probation is false", () => {
    const events = [fact({ id: "a", points: 5 })];
    const result = evaluatePolicyRule(rule({ anyOf: [{ kind: "sum_points_gte", value: 9 }] }), {
      now: NOW,
      events,
      probation: false,
      hasOpenProposalForRule: false,
    });
    expect(result.triggered).toBe(false);
  });
});

describe("evaluatePolicyRule: auto-apply invariant", () => {
  it("only ever auto-applies warn or restrict, even when the rule says autoApply: true", () => {
    const events = [fact({ id: "a", points: 100 })];
    for (const action of [
      "suspend",
      "ban",
      "hide_profile",
      "remove_content",
      "reinstate",
    ] as const) {
      const result = evaluatePolicyRule(
        rule({ action, autoApply: true, anyOf: [{ kind: "sum_points_gte", value: 1 }] }),
        { now: NOW, events, probation: false, hasOpenProposalForRule: false },
      );
      expect(result.triggered).toBe(true);
      if (result.triggered) expect(result.autoApply).toBe(false);
    }
    for (const action of ["warn", "restrict"] as const) {
      const result = evaluatePolicyRule(
        rule({ action, autoApply: true, anyOf: [{ kind: "sum_points_gte", value: 1 }] }),
        { now: NOW, events, probation: false, hasOpenProposalForRule: false },
      );
      expect(result.triggered).toBe(true);
      if (result.triggered) expect(result.autoApply).toBe(true);
    }
  });

  it("never auto-applies when the rule itself has autoApply: false", () => {
    const events = [fact({ id: "a", points: 100 })];
    const result = evaluatePolicyRule(
      rule({ action: "warn", autoApply: false, anyOf: [{ kind: "sum_points_gte", value: 1 }] }),
      { now: NOW, events, probation: false, hasOpenProposalForRule: false },
    );
    expect(result.triggered).toBe(true);
    if (result.triggered) expect(result.autoApply).toBe(false);
  });
});

describe("evaluatePolicyRule: anyOf short-circuits on the first matching condition", () => {
  it("returns the first matched condition when multiple would independently match", () => {
    const events = [fact({ id: "a", points: 9, type: "mentor_no_show" })];
    const result = evaluatePolicyRule(
      rule({
        anyOf: [
          { kind: "sum_points_gte", value: 9 },
          { kind: "count_type_gte", eventType: "mentor_no_show", value: 1 },
        ],
      }),
      { now: NOW, events, probation: false, hasOpenProposalForRule: false },
    );
    expect(result.triggered).toBe(true);
    if (result.triggered)
      expect(result.matchedCondition).toEqual({ kind: "sum_points_gte", value: 9 });
  });
});

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  quoteOrderItem,
  type CommissionRule,
  type QuoteContext,
} from "@/server/modules/payments/domain/commission";

const now = new Date("2026-01-01T00:00:00.000Z");

function rule(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    id: "global-rule",
    scopeType: "global",
    scopeRef: null,
    percentBps: 1000,
    fixedMinor: 0,
    currency: "INR",
    minFeeMinor: null,
    maxFeeMinor: null,
    feeBearer: "mentor",
    studentFeeBps: null,
    priority: 0,
    validFrom: new Date("2020-01-01T00:00:00.000Z"),
    validTo: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<QuoteContext> = {}): QuoteContext {
  return {
    baseMinor: 200_000,
    currency: "INR",
    serviceKind: "one_on_one",
    categoryId: null,
    mentorUserId: "mentor-1",
    promoCode: null,
    now,
    ...overrides,
  };
}

describe("quoteOrderItem", () => {
  it("computes a 10% global commission, flooring to the mentor's benefit", () => {
    const quote = quoteOrderItem(ctx({ baseMinor: 200_001 }), [rule()]);
    expect(quote).toMatchObject({
      commissionMinor: 20_000, // floor(200001 * 0.10) = 20000.1 -> 20000
      mentorShareMinor: 180_001,
    });
  });

  it("returns null when no rule matches (never silently defaults a fee)", () => {
    expect(quoteOrderItem(ctx(), [])).toBeNull();
    expect(quoteOrderItem(ctx({ currency: "EUR" }), [rule({ currency: "INR" })])).toBeNull();
  });

  it("prefers mentor scope over global", () => {
    const global = rule({ id: "global", percentBps: 1000 });
    const mentorRule = rule({
      id: "mentor",
      scopeType: "mentor",
      scopeRef: "mentor-1",
      percentBps: 500,
    });
    const quote = quoteOrderItem(ctx(), [global, mentorRule]);
    expect(quote?.commissionRuleId).toBe("mentor");
  });

  it("precedence is mentor > promotion > category > service_kind > global", () => {
    const rules = [
      rule({ id: "global", percentBps: 100 }),
      rule({ id: "kind", scopeType: "service_kind", scopeRef: "one_on_one", percentBps: 200 }),
      rule({ id: "category", scopeType: "category", scopeRef: "cat-1", percentBps: 300 }),
      rule({ id: "promo", scopeType: "promotion", scopeRef: "LAUNCH10", percentBps: 400 }),
      rule({ id: "mentor", scopeType: "mentor", scopeRef: "mentor-1", percentBps: 500 }),
    ];
    expect(
      quoteOrderItem(ctx({ categoryId: "cat-1", promoCode: "LAUNCH10" }), rules)?.commissionRuleId,
    ).toBe("mentor");
    expect(
      quoteOrderItem(
        ctx({ mentorUserId: "someone-else", categoryId: "cat-1", promoCode: "LAUNCH10" }),
        rules,
      )?.commissionRuleId,
    ).toBe("promo");
    expect(
      quoteOrderItem(ctx({ mentorUserId: "someone-else", categoryId: "cat-1" }), rules)
        ?.commissionRuleId,
    ).toBe("category");
    expect(quoteOrderItem(ctx({ mentorUserId: "someone-else" }), rules)?.commissionRuleId).toBe(
      "kind",
    );
  });

  it("ties within a scope break on priority, then newest validFrom", () => {
    const older = rule({ id: "older", priority: 0, validFrom: new Date("2025-01-01") });
    const newer = rule({ id: "newer", priority: 0, validFrom: new Date("2025-06-01") });
    expect(quoteOrderItem(ctx(), [older, newer])?.commissionRuleId).toBe("newer");

    const lowPriority = rule({ id: "low", priority: 0 });
    const highPriority = rule({ id: "high", priority: 5 });
    expect(quoteOrderItem(ctx(), [lowPriority, highPriority])?.commissionRuleId).toBe("high");
  });

  it("ignores a rule outside its validity window", () => {
    const expired = rule({ validFrom: new Date("2020-01-01"), validTo: new Date("2025-01-01") });
    expect(quoteOrderItem(ctx(), [expired])).toBeNull();
    const notYet = rule({ validFrom: new Date("2027-01-01") });
    expect(quoteOrderItem(ctx(), [notYet])).toBeNull();
  });

  it("applies min/max fee caps", () => {
    const capped = rule({ percentBps: 10_000, maxFeeMinor: 50_000 }); // 100% would be 200000, capped
    expect(quoteOrderItem(ctx(), [capped])?.commissionMinor).toBe(50_000);
    const floored = rule({ percentBps: 0, fixedMinor: 100, minFeeMinor: 5_000 });
    expect(quoteOrderItem(ctx(), [floored])?.commissionMinor).toBe(5_000);
  });

  it("commission never exceeds the base price even with a large fixed fee", () => {
    const huge = rule({ percentBps: 0, fixedMinor: 10_000_000 });
    const quote = quoteOrderItem(ctx({ baseMinor: 1_000 }), [huge]);
    expect(quote?.commissionMinor).toBe(1_000);
    expect(quote?.mentorShareMinor).toBe(0);
  });

  it("computes a student-borne fee on top of the base price when the bearer is student or split", () => {
    const studentBorne = rule({ feeBearer: "student", studentFeeBps: 300 });
    const quote = quoteOrderItem(ctx({ baseMinor: 100_000 }), [studentBorne]);
    expect(quote).toMatchObject({ studentFeeMinor: 3_000, totalStudentPaysMinor: 103_000 });
  });

  it("no student fee when the bearer is mentor, even if studentFeeBps is set", () => {
    const quote = quoteOrderItem(ctx(), [rule({ feeBearer: "mentor", studentFeeBps: 300 })]);
    expect(quote).toMatchObject({ studentFeeMinor: 0, totalStudentPaysMinor: 200_000 });
  });
});

describe("quoteOrderItem (property-based)", () => {
  it("commission + mentorShare always equals the base price, for any valid bps/fixed/base", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000_000 }), // baseMinor
        fc.integer({ min: 0, max: 5_000 }), // percentBps (0-50%)
        fc.integer({ min: 0, max: 1_000_000 }), // fixedMinor
        (baseMinor, percentBps, fixedMinor) => {
          const quote = quoteOrderItem(ctx({ baseMinor }), [rule({ percentBps, fixedMinor })]);
          expect(quote).not.toBeNull();
          expect(quote!.commissionMinor + quote!.mentorShareMinor).toBe(baseMinor);
          expect(quote!.commissionMinor).toBeGreaterThanOrEqual(0);
          expect(quote!.mentorShareMinor).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("commission is always within [min, max] once clamped, and never exceeds base", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (baseMinor, percentBps, fixedMinor, maxFeeMinor) => {
          const quote = quoteOrderItem(ctx({ baseMinor }), [
            rule({ percentBps, fixedMinor, maxFeeMinor }),
          ]);
          expect(quote!.commissionMinor).toBeLessThanOrEqual(Math.min(maxFeeMinor, baseMinor));
        },
      ),
      { numRuns: 500 },
    );
  });
});

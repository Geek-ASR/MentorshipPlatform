import { describe, expect, it } from "vitest";
import { bayesianAverage, computeReliabilityPct } from "@/server/modules/trust/domain/reliability";

describe("computeReliabilityPct", () => {
  it("is 100 when there are no ended sessions", () => {
    expect(computeReliabilityPct(0, 0)).toBe(100);
  });

  it("is 100 when there are zero unreliable sessions", () => {
    expect(computeReliabilityPct(0, 20)).toBe(100);
  });

  it("computes the complement of the unreliable rate, rounded", () => {
    expect(computeReliabilityPct(1, 10)).toBe(90);
    expect(computeReliabilityPct(3, 10)).toBe(70);
  });

  it("clamps to 0 when every session was unreliable", () => {
    expect(computeReliabilityPct(10, 10)).toBe(0);
  });

  it("never goes negative or above 100 for edge inputs", () => {
    expect(computeReliabilityPct(15, 10)).toBeGreaterThanOrEqual(0);
    expect(computeReliabilityPct(15, 10)).toBeLessThanOrEqual(100);
  });
});

describe("bayesianAverage", () => {
  it("equals the platform mean when there are no ratings yet", () => {
    expect(bayesianAverage(0, 0, 4.5, 5)).toBe(4.5);
  });

  it("pulls toward the mentor's own ratings as the count grows", () => {
    const fewRatings = bayesianAverage(5, 1, 4.5, 5); // one 5-star rating.
    const manyRatings = bayesianAverage(500, 100, 4.5, 5); // 100 ratings averaging 5.
    expect(fewRatings).toBeGreaterThan(4.5);
    expect(fewRatings).toBeLessThan(5);
    expect(manyRatings).toBeGreaterThan(fewRatings);
    expect(manyRatings).toBeCloseTo(5, 1);
  });

  it("matches the worked formula: (weight*mean + sum) / (weight + count)", () => {
    expect(bayesianAverage(20, 4, 3, 5)).toBeCloseTo((5 * 3 + 20) / (5 + 4), 10);
  });
});

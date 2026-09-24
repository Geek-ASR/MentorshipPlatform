import { describe, expect, it } from "vitest";
import {
  canReduceCapacity,
  deriveSeatPriceMinor,
  isMinimumMet,
} from "@/server/modules/booking/domain/group";

describe("deriveSeatPriceMinor (docs/09 §8 worked example)", () => {
  it("₹2,400 / 4 seats -> ₹600/seat", () => {
    expect(deriveSeatPriceMinor(240_000, 4)).toBe(60_000);
  });

  it("rounds up so the mentor never nets less than their target at full capacity", () => {
    // 100 / 3 = 33.33... -> 34, so 3 * 34 = 102 >= 100.
    expect(deriveSeatPriceMinor(100, 3)).toBe(34);
  });

  it("an already-even split needs no rounding", () => {
    expect(deriveSeatPriceMinor(300, 3)).toBe(100);
  });
});

describe("canReduceCapacity (docs/18 B25)", () => {
  it("allows a reduction that still fits every live seat", () => {
    expect(canReduceCapacity(5, 3)).toBe(true);
    expect(canReduceCapacity(3, 3)).toBe(true);
  });

  it("rejects a reduction below the seats already live", () => {
    expect(canReduceCapacity(2, 3)).toBe(false);
  });
});

describe("isMinimumMet (docs/09 §8)", () => {
  it("met when live seats reach the minimum", () => {
    expect(isMinimumMet(3, 3)).toBe(true);
    expect(isMinimumMet(4, 3)).toBe(true);
  });

  it("unmet below the minimum", () => {
    expect(isMinimumMet(2, 3)).toBe(false);
  });
});

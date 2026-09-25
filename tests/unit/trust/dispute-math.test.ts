import { describe, expect, it } from "vitest";
import {
  evidenceFavoredResolution,
  refundMinorFor,
  resolveRefundPct,
} from "@/server/modules/trust/domain/dispute-math";

describe("resolveRefundPct", () => {
  it("full_refund is always 100", () => {
    expect(resolveRefundPct("full_refund", 50)).toBe(100);
  });

  it("no_refund is always 0", () => {
    expect(resolveRefundPct("no_refund", 50)).toBe(0);
  });

  it("partial_refund uses the given split percentage", () => {
    expect(resolveRefundPct("partial_refund", 30)).toBe(30);
    expect(resolveRefundPct("partial_refund", 50)).toBe(50);
  });
});

describe("refundMinorFor", () => {
  it("computes the exact minor-unit amount for a percentage", () => {
    expect(refundMinorFor(200000, 100)).toBe(200000);
    expect(refundMinorFor(200000, 0)).toBe(0);
    expect(refundMinorFor(200000, 50)).toBe(100000);
  });

  it("rounds to the nearest minor unit rather than truncating", () => {
    expect(refundMinorFor(100001, 50)).toBe(50001); // 50000.5 rounds up.
    expect(refundMinorFor(100000, 33)).toBe(33000);
  });
});

describe("evidenceFavoredResolution (docs/10 §8 worked example)", () => {
  it("defaults to a full refund when neither side signaled", () => {
    expect(evidenceFavoredResolution({ studentSignaled: false, mentorSignaled: false })).toBe(
      "full_refund",
    );
  });

  it("favors the student with a full refund when only the student signaled", () => {
    expect(evidenceFavoredResolution({ studentSignaled: true, mentorSignaled: false })).toBe(
      "full_refund",
    );
  });

  it("favors the mentor with no refund when only the mentor signaled", () => {
    expect(evidenceFavoredResolution({ studentSignaled: false, mentorSignaled: true })).toBe(
      "no_refund",
    );
  });

  it("splits the refund when both sides signaled (balanced evidence)", () => {
    expect(evidenceFavoredResolution({ studentSignaled: true, mentorSignaled: true })).toBe(
      "partial_refund",
    );
  });
});

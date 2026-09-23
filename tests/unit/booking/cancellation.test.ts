import { describe, expect, it } from "vitest";
import {
  cancellationQuote,
  mentorCancellationNoticePoints,
  type CancellationPolicySnapshot,
} from "@/server/modules/booking/domain/cancellation";

const policy: CancellationPolicySnapshot = {
  fullRefundHours: 24,
  partialRefundHours: 6,
  partialRefundPct: 50,
  lateRefundPct: 0,
  mentorRefundPct: 100,
};

describe("cancellationQuote", () => {
  it("full refund at or beyond the full-refund window", () => {
    expect(
      cancellationQuote({
        actor: "student",
        hoursNotice: 24,
        priceMinor: 200000,
        policy,
        courtesyAvailable: false,
      }),
    ).toMatchObject({ refundPct: 100, refundMinor: 200000, window: "full" });
  });

  it("partial refund inside the partial window", () => {
    expect(
      cancellationQuote({
        actor: "student",
        hoursNotice: 10,
        priceMinor: 200000,
        policy,
        courtesyAvailable: false,
      }),
    ).toMatchObject({ refundPct: 50, refundMinor: 100000, window: "partial" });
  });

  it("late cancellation with no courtesy left refunds at the late rate", () => {
    expect(
      cancellationQuote({
        actor: "student",
        hoursNotice: 1,
        priceMinor: 200000,
        policy,
        courtesyAvailable: false,
      }),
    ).toMatchObject({ refundPct: 0, refundMinor: 0, usedCourtesy: false, window: "late" });
  });

  it("late cancellation with courtesy available uses the partial rate once", () => {
    expect(
      cancellationQuote({
        actor: "student",
        hoursNotice: 1,
        priceMinor: 200000,
        policy,
        courtesyAvailable: true,
      }),
    ).toMatchObject({ refundPct: 50, refundMinor: 100000, usedCourtesy: true, window: "late" });
  });

  it("mentor cancellation is always a full refund regardless of notice", () => {
    expect(
      cancellationQuote({
        actor: "mentor",
        hoursNotice: 0,
        priceMinor: 200000,
        policy,
        courtesyAvailable: false,
      }),
    ).toMatchObject({ refundPct: 100, refundMinor: 200000, window: "not_applicable" });
  });

  it("a free booking always refunds zero minor units regardless of percentage", () => {
    expect(
      cancellationQuote({
        actor: "student",
        hoursNotice: 1,
        priceMinor: 0,
        policy,
        courtesyAvailable: false,
      }),
    ).toMatchObject({ refundMinor: 0 });
    expect(
      cancellationQuote({
        actor: "mentor",
        hoursNotice: 0,
        priceMinor: 0,
        policy,
        courtesyAvailable: false,
      }),
    ).toMatchObject({ refundMinor: 0 });
  });
});

describe("mentorCancellationNoticePoints", () => {
  it.each([
    [100, 0],
    [72, 0],
    [48, 1],
    [24, 1],
    [10, 2],
    [2, 2],
    [1, 3],
    [0, 3],
  ])("hoursNotice=%d -> %d points", (hours, points) => {
    expect(mentorCancellationNoticePoints(hours)).toBe(points);
  });
});

import { describe, expect, it } from "vitest";
import { zonedInstant } from "@/ui/zoned-time";

describe("zonedInstant", () => {
  it("converts a wall-clock time in India (no daylight saving)", () => {
    expect(zonedInstant("2026-10-12", "19:30", "Asia/Kolkata").toISOString()).toBe(
      "2026-10-12T14:00:00.000Z",
    );
  });

  it("uses summer time before the European change and winter time after it", () => {
    // Berlin leaves CEST (UTC+2) for CET (UTC+1) on 25 October 2026.
    expect(zonedInstant("2026-10-24", "18:00", "Europe/Berlin").toISOString()).toBe(
      "2026-10-24T16:00:00.000Z",
    );
    expect(zonedInstant("2026-10-26", "18:00", "Europe/Berlin").toISOString()).toBe(
      "2026-10-26T17:00:00.000Z",
    );
  });

  it("handles midnight and a half-hour-offset zone", () => {
    expect(zonedInstant("2026-11-01", "00:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-10-31T18:30:00.000Z",
    );
    expect(zonedInstant("2026-11-01", "09:15", "Asia/Kathmandu").toISOString()).toBe(
      "2026-11-01T03:30:00.000Z",
    );
  });
});

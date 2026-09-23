import { describe, expect, it } from "vitest";
import {
  addMinutes,
  isValidTimeZone,
  localDateKey,
  localDatesOverlapping,
  toInstant,
  zonedParts,
} from "@/server/modules/booking/domain/time";

describe("toInstant / zonedParts round trip", () => {
  it("converts Berlin local time to UTC across the CET/CEST boundary (docs/09 §3.2)", () => {
    // Mon 12 Jan 2026 10:00 Europe/Berlin (CET, UTC+1) -> 09:00Z
    expect(
      toInstant({ year: 2026, month: 1, day: 12 }, { hour: 10, minute: 0 }, "Europe/Berlin"),
    ).toEqual(new Date("2026-01-12T09:00:00.000Z"));
    // Mon 30 Mar 2026 10:00 Europe/Berlin (CEST, UTC+2, after the 29 Mar switch) -> 08:00Z
    expect(
      toInstant({ year: 2026, month: 3, day: 30 }, { hour: 10, minute: 0 }, "Europe/Berlin"),
    ).toEqual(new Date("2026-03-30T08:00:00.000Z"));
  });

  it("is a true inverse for an unambiguous instant", () => {
    const instant = new Date("2026-06-15T12:34:00.000Z");
    const parts = zonedParts(instant, "Asia/Kolkata");
    expect(parts).toMatchObject({ year: 2026, month: 6, day: 15, hour: 18, minute: 4, weekday: 1 });
  });
});

describe("DST edge fixtures (docs/09 §3.3)", () => {
  it("spring-forward: 02:00-04:00 on 29 Mar 2026 Europe/Berlin only has a 1h window", () => {
    const start = toInstant(
      { year: 2026, month: 3, day: 29 },
      { hour: 2, minute: 0 },
      "Europe/Berlin",
    );
    const end = toInstant(
      { year: 2026, month: 3, day: 29 },
      { hour: 4, minute: 0 },
      "Europe/Berlin",
    );
    expect((end.getTime() - start.getTime()) / 60_000).toBe(60);
  });

  it("fall-back: 01:30-03:30 on 25 Oct 2026 Europe/Berlin spans 3h of real time", () => {
    const start = toInstant(
      { year: 2026, month: 10, day: 25 },
      { hour: 1, minute: 30 },
      "Europe/Berlin",
      "earlier",
    );
    const end = toInstant(
      { year: 2026, month: 10, day: 25 },
      { hour: 3, minute: 30 },
      "Europe/Berlin",
      "later",
    );
    expect((end.getTime() - start.getTime()) / 60_000).toBe(180);
  });

  it("America/New_York 8 Mar 2026 spring-forward loses an hour", () => {
    const start = toInstant(
      { year: 2026, month: 3, day: 8 },
      { hour: 1, minute: 0 },
      "America/New_York",
    );
    const end = toInstant(
      { year: 2026, month: 3, day: 8 },
      { hour: 4, minute: 0 },
      "America/New_York",
    );
    expect((end.getTime() - start.getTime()) / 60_000).toBe(120);
  });

  it("half-hour offset zone Asia/Kolkata has no DST", () => {
    const instant = toInstant(
      { year: 2026, month: 7, day: 1 },
      { hour: 9, minute: 0 },
      "Asia/Kolkata",
    );
    expect(instant).toEqual(new Date("2026-07-01T03:30:00.000Z"));
  });

  it("45-minute offset zone Asia/Kathmandu", () => {
    const instant = toInstant(
      { year: 2026, month: 7, day: 1 },
      { hour: 9, minute: 0 },
      "Asia/Kathmandu",
    );
    expect(instant).toEqual(new Date("2026-07-01T03:15:00.000Z"));
  });

  it("half-hour DST zone Australia/Lord_Howe", () => {
    expect(isValidTimeZone("Australia/Lord_Howe")).toBe(true);
    const summer = toInstant(
      { year: 2026, month: 1, day: 15 },
      { hour: 12, minute: 0 },
      "Australia/Lord_Howe",
    );
    const winter = toInstant(
      { year: 2026, month: 7, day: 15 },
      { hour: 12, minute: 0 },
      "Australia/Lord_Howe",
    );
    // Lord Howe DST offset differs from standard by 30 minutes, not 60.
    const summerOffset = zonedParts(summer, "Australia/Lord_Howe").offsetMinutes;
    const winterOffset = zonedParts(winter, "Australia/Lord_Howe").offsetMinutes;
    expect(Math.abs(summerOffset - winterOffset)).toBe(30);
  });
});

describe("localDateKey / localDatesOverlapping", () => {
  it("groups an instant by the mentor's local calendar date, not UTC date", () => {
    // 2026-01-01T23:00Z is already 2026-01-02 in Kolkata (+5:30).
    expect(localDateKey(new Date("2026-01-01T23:00:00.000Z"), "Asia/Kolkata")).toBe("2026-01-02");
    expect(localDateKey(new Date("2026-01-01T23:00:00.000Z"), "UTC")).toBe("2026-01-01");
  });

  it("walks every local date overlapping a window, widened for zone spread", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-03T00:00:00.000Z");
    const dates = [...localDatesOverlapping(from, to, "Asia/Kolkata")].map(
      (d) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
    );
    expect(dates).toContain("2025-12-31");
    expect(dates).toContain("2026-01-01");
    expect(dates).toContain("2026-01-02");
    expect(dates).toContain("2026-01-03");
  });

  it("returns nothing for an empty or inverted window", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    expect([...localDatesOverlapping(t, t, "UTC")]).toEqual([]);
    expect([...localDatesOverlapping(addMinutes(t, 60), t, "UTC")]).toEqual([]);
  });
});

describe("isValidTimeZone", () => {
  it("rejects bogus zone names", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
  });
});

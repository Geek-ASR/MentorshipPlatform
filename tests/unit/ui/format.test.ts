import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatMoney,
  formatRelativeDay,
  formatTimeRange,
  greeting,
  initials,
  pluralize,
  toneFor,
  zoneLabel,
} from "@/ui/format";

describe("formatMoney", () => {
  it("shows whole rupees without decimals and zero as Free", () => {
    expect(formatMoney(150_000, "INR")).toBe("₹1,500");
    expect(formatMoney(0, "INR")).toBe("Free");
    expect(formatMoney(0, "INR", { zeroAsFree: false })).toBe("₹0");
  });

  it("keeps cents when the amount has them", () => {
    expect(formatMoney(1_250, "EUR")).toBe("€12.50");
  });
});

describe("time zone labels (docs/22 §1 time clarity)", () => {
  const october = new Date("2026-10-02T09:00:00Z");

  it("prefers a real abbreviation over a GMT offset", () => {
    expect(zoneLabel(october, "Asia/Kolkata")).toBe("IST");
    expect(zoneLabel(october, "Europe/Berlin")).toBe("CEST");
    expect(zoneLabel(october, "UTC")).toBe("UTC");
  });

  it("falls back to an offset when no abbreviation exists", () => {
    expect(zoneLabel(october, "Asia/Kathmandu")).toBe("GMT+5:45");
  });

  it("renders a range with the zone once", () => {
    const end = new Date("2026-10-02T10:00:00Z");
    expect(formatTimeRange(october, end, "Asia/Kolkata")).toBe("2:30 pm – 3:30 pm IST");
  });

  it("names today and tomorrow in the viewer's zone, not UTC", () => {
    // 20:00 UTC on 1 Oct is already 2 Oct in India.
    const now = new Date("2026-10-01T20:00:00Z");
    expect(formatRelativeDay(new Date("2026-10-02T05:00:00Z"), "Asia/Kolkata", now)).toBe("Today");
    expect(formatRelativeDay(new Date("2026-10-02T05:00:00Z"), "UTC", now)).toBe("Tomorrow");
  });
});

describe("small display helpers", () => {
  it("builds initials from first and last names", () => {
    expect(initials("Ananya Iyer")).toBe("AI");
    expect(initials("  kabir  ")).toBe("K");
    expect(initials("Mary Jane Watson")).toBe("MW");
    expect(initials("")).toBe("?");
  });

  it("gives the same person the same avatar tone every time", () => {
    expect(toneFor("user-123")).toBe(toneFor("user-123"));
    expect(toneFor("user-123")).toMatch(/^tone-[1-6]$/);
  });

  it("formats durations and plurals", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(90)).toBe("1 hr 30 min");
    expect(pluralize(1, "seat")).toBe("1 seat");
    expect(pluralize(3, "seat")).toBe("3 seats");
  });

  it("greets by the viewer's local hour", () => {
    expect(greeting("Asia/Kolkata", new Date("2026-10-02T03:00:00Z"))).toBe("Good morning");
    expect(greeting("Asia/Kolkata", new Date("2026-10-02T09:00:00Z"))).toBe("Good afternoon");
    expect(greeting("Asia/Kolkata", new Date("2026-10-02T15:00:00Z"))).toBe("Good evening");
  });
});

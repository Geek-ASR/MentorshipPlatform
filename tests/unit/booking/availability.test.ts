import { describe, expect, it } from "vitest";
import { generateAvailableSlots } from "@/server/modules/booking/domain/availability";
import { toInstant } from "@/server/modules/booking/domain/time";

const baseInput = {
  timeZone: "Europe/Berlin",
  durationMin: 60,
  slotStepMin: 30,
  bufferAfterMin: 15,
  minNoticeMin: 60,
  maxAdvanceDays: 60,
  maxSessionsPerDay: 4,
  exceptions: [],
  activeBlocks: [],
  sessionCountByLocalDate: new Map<string, number>(),
};

// A Monday 10:00-13:00 Europe/Berlin rule, open-ended from 2026-01-01.
const mondayRule = {
  weekday: 1,
  startLocal: { hour: 10, minute: 0 },
  endLocal: { hour: 13, minute: 0 },
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

describe("generateAvailableSlots", () => {
  it("produces stepped 60-min slots inside a 10:00-13:00 window", () => {
    const now = new Date("2026-01-05T00:00:00.000Z"); // Monday 12 Jan is the next Monday
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [mondayRule],
      now,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-20T00:00:00.000Z"),
    });
    const mon12 = slots.filter((s) => s.start.toISOString().startsWith("2026-01-12"));
    // 10:00-11:00, 10:30-11:30, 11:00-12:00, 11:30-12:30, 12:00-13:00 = 5 slots (60min duration, 30min step)
    expect(mon12).toHaveLength(5);
    expect(mon12[0]!.start).toEqual(
      toInstant({ year: 2026, month: 1, day: 12 }, { hour: 10, minute: 0 }, "Europe/Berlin"),
    );
  });

  it("excludes slots before min_notice and after max_advance", () => {
    const now = new Date("2026-01-12T09:30:00.000Z"); // Monday 12 Jan, 10:30 Berlin local
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [mondayRule],
      now,
      minNoticeMin: 60,
      from: new Date("2026-01-12T00:00:00.000Z"),
      to: new Date("2026-01-12T23:59:00.000Z"),
    });
    // now + 60min notice = 10:30Z = 11:30 Berlin; slots starting before that are excluded.
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-01-12T10:30:00.000Z").getTime(),
      );
    }
  });

  it("removes slots overlapping an unavailable exception", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [mondayRule],
      now,
      from: new Date("2026-01-12T00:00:00.000Z"),
      to: new Date("2026-01-12T23:59:00.000Z"),
      exceptions: [
        {
          kind: "unavailable",
          start: new Date("2026-01-12T09:00:00.000Z"),
          end: new Date("2026-01-12T10:30:00.000Z"),
        },
      ],
    });
    // 10:00 Berlin (09:00Z) slot overlaps the exception and must be gone.
    expect(slots.find((s) => s.start.toISOString() === "2026-01-12T09:00:00.000Z")).toBeUndefined();
  });

  it("adds extra_available exceptions as their own bookable window", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [],
      now,
      from: new Date("2026-01-14T00:00:00.000Z"),
      to: new Date("2026-01-15T00:00:00.000Z"),
      exceptions: [
        {
          kind: "extra_available",
          start: new Date("2026-01-14T08:00:00.000Z"),
          end: new Date("2026-01-14T10:00:00.000Z"),
        },
      ],
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.start).toEqual(new Date("2026-01-14T08:00:00.000Z"));
  });

  it("removes candidates whose buffered window intersects an active calendar block", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [mondayRule],
      now,
      from: new Date("2026-01-12T00:00:00.000Z"),
      to: new Date("2026-01-12T23:59:00.000Z"),
      activeBlocks: [
        { start: new Date("2026-01-12T09:00:00.000Z"), end: new Date("2026-01-12T10:15:00.000Z") },
      ],
    });
    // 10:00 Berlin (09:00Z-10:00Z) and 10:30 Berlin (09:30Z-10:30Z) both overlap the block or its buffer removal window.
    expect(slots.find((s) => s.start.toISOString() === "2026-01-12T09:00:00.000Z")).toBeUndefined();
  });

  it("allows adjacent slots exactly at the buffer boundary (docs/13 concurrency fixture)", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [
        {
          weekday: 1,
          startLocal: { hour: 10, minute: 0 },
          endLocal: { hour: 12, minute: 30 },
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
        },
      ],
      slotStepMin: 15,
      now,
      from: new Date("2026-01-12T00:00:00.000Z"),
      to: new Date("2026-01-12T23:59:00.000Z"),
      // A block for 10:00-11:00 + 15min buffer -> active until 11:15.
      activeBlocks: [
        { start: new Date("2026-01-12T09:00:00.000Z"), end: new Date("2026-01-12T10:15:00.000Z") },
      ],
    });
    // 11:15 Berlin (10:15Z) start should be free (right at the buffer edge, exclusive).
    expect(slots.find((s) => s.start.toISOString() === "2026-01-12T10:15:00.000Z")).toBeDefined();
  });

  it("respects the daily session cap", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [mondayRule],
      now,
      maxSessionsPerDay: 1,
      from: new Date("2026-01-12T00:00:00.000Z"),
      to: new Date("2026-01-12T23:59:00.000Z"),
      sessionCountByLocalDate: new Map([["2026-01-12", 1]]),
    });
    expect(slots).toHaveLength(0);
  });

  it("returns an empty list for an inverted or empty window", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const slots = generateAvailableSlots({
      ...baseInput,
      rules: [mondayRule],
      now,
      from: new Date("2026-01-20T00:00:00.000Z"),
      to: new Date("2026-01-12T00:00:00.000Z"),
    });
    expect(slots).toEqual([]);
  });
});

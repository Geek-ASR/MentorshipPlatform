import { describe, expect, it } from "vitest";
import { generateBookingIcs } from "@/server/modules/booking/application/ics";

describe("generateBookingIcs", () => {
  const base = {
    bookingId: "0192abcd-0000-7000-8000-000000000001",
    start: new Date("2026-10-03T08:30:00.000Z"),
    end: new Date("2026-10-03T09:30:00.000Z"),
    sequence: 0,
    status: "CONFIRMED" as const,
    summary: "Mentorship session",
    joinUrl: "https://app.aheadly.invalid/sessions/abc/join",
    policyUrl: "https://app.aheadly.invalid/legal/refund-cancellation",
    generatedAt: new Date("2026-09-17T10:40:00.000Z"),
  };

  it("produces a valid VEVENT with UTC Z timestamps and no other participant's email", () => {
    const ics = generateBookingIcs(base);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261003T083000Z");
    expect(ics).toContain("DTEND:20261003T093000Z");
    expect(ics).toContain("UID:booking-0192abcd-0000-7000-8000-000000000001@aheadly.invalid");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).not.toMatch(/mailto:(?!support@)/);
  });

  it("uses METHOD:CANCEL and STATUS:CANCELLED for a cancelled booking", () => {
    const ics = generateBookingIcs({ ...base, status: "CANCELLED" });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("increments SEQUENCE on reschedule", () => {
    const ics = generateBookingIcs({ ...base, sequence: 2 });
    expect(ics).toContain("SEQUENCE:2");
  });

  it("escapes commas, semicolons and newlines in text fields", () => {
    const ics = generateBookingIcs({ ...base, summary: "Career chat; tips, notes" });
    expect(ics).toContain("SUMMARY:Career chat\\; tips\\, notes");
  });

  it("folds lines longer than 75 octets per RFC 5545", () => {
    const longJoinUrl = `https://app.aheadly.invalid/sessions/${"a".repeat(120)}/join`;
    const ics = generateBookingIcs({ ...base, joinUrl: longJoinUrl });
    const locationLine = ics.split("\r\n").find((l) => l.startsWith("LOCATION:"));
    expect(locationLine!.length).toBeLessThanOrEqual(75);
  });
});

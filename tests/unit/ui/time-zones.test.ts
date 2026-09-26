import { describe, expect, it } from "vitest";
import { currentZoneName, listTimeZones } from "@/ui/time-zones";

describe("time zone names", () => {
  it("maps ICU's legacy identifiers to current IANA names", () => {
    expect(currentZoneName("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(currentZoneName("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(currentZoneName("Europe/Berlin")).toBe("Europe/Berlin");
  });

  it("lists current names only, always including the saved zone", () => {
    const zones = listTimeZones("UTC");
    expect(zones).toContain("Asia/Kolkata");
    expect(zones).not.toContain("Asia/Calcutta");
    expect(zones).toContain("UTC");
    expect(zones).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
  });

  it("every listed zone is one the runtime accepts", () => {
    for (const zone of listTimeZones("UTC")) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: zone })).not.toThrow();
    }
  });
});

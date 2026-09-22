import { describe, expect, it } from "vitest";
import { universityEmailLabel, workEmailLabel } from "@/server/modules/verification/domain/labels";

describe("evidence badge labels (docs/10 §2.1: scoped, never just 'Verified')", () => {
  it("names the institution, the method and the month for a current-student email", () => {
    const label = universityEmailLabel(
      "Technical University of Munich",
      new Date("2026-03-15T00:00:00Z"),
      false,
    );
    expect(label).toBe(
      "Education: Technical University of Munich — university email confirmed (Mar 2026)",
    );
  });

  it("distinguishes an alumni address", () => {
    const label = universityEmailLabel(
      "Technical University of Munich",
      new Date("2026-03-15T00:00:00Z"),
      true,
    );
    expect(label).toContain("alumni email confirmed");
  });

  it("names the employer for a work email", () => {
    const label = workEmailLabel("Google", new Date("2026-06-01T00:00:00Z"));
    expect(label).toBe("Work: Google — work email confirmed (Jun 2026)");
  });
});

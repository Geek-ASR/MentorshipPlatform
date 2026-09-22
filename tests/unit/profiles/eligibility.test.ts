import { describe, expect, it } from "vitest";
import {
  attestationExpiresAt,
  resolvePayoutMode,
  type CountryRules,
} from "@/server/modules/profiles/domain/eligibility";

const rules: CountryRules = {
  "*": {
    citizen_or_pr: "paid",
    work_authorised: "paid",
    student_visa: "volunteer",
    not_authorised: "volunteer",
    other: "volunteer",
  },
  DE: { student_visa: "volunteer", work_authorised: "paid" },
};

describe("resolvePayoutMode", () => {
  it("uses the wildcard rule when no country-specific override exists", () => {
    expect(resolvePayoutMode("IN", "citizen_or_pr", rules)).toBe("paid");
    expect(resolvePayoutMode("IN", "student_visa", rules)).toBe("volunteer");
  });

  it("prefers a country-specific override over the wildcard", () => {
    expect(resolvePayoutMode("DE", "work_authorised", rules)).toBe("paid");
  });

  it("defaults to volunteer for a status the ruleset doesn't map (protect first)", () => {
    const sparse: CountryRules = { "*": {} };
    expect(resolvePayoutMode("IN", "citizen_or_pr", sparse)).toBe("volunteer");
  });

  it("defaults to volunteer when the country has no rule and no wildcard exists", () => {
    expect(resolvePayoutMode("XX", "citizen_or_pr", {})).toBe("volunteer");
  });
});

describe("attestationExpiresAt", () => {
  it("adds the configured number of days", () => {
    const attestedAt = new Date("2026-01-01T00:00:00Z");
    expect(attestationExpiresAt(attestedAt, 365).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

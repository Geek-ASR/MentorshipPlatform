import { describe, expect, it } from "vitest";
import {
  emailDomainMatches,
  extractDomain,
} from "@/server/modules/verification/domain/domain-match";

describe("emailDomainMatches", () => {
  it("matches the exact registered domain", () => {
    expect(emailDomainMatches("student@tum.de", "tum.de")).toBe(true);
  });

  it("matches a subdomain of the registered domain", () => {
    expect(emailDomainMatches("student@cs.tum.de", "tum.de")).toBe(true);
  });

  it("rejects an unrelated domain, including a lookalike suffix", () => {
    expect(emailDomainMatches("student@nottum.de", "tum.de")).toBe(false);
    expect(emailDomainMatches("student@example.com", "tum.de")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(emailDomainMatches("Student@TUM.DE", "tum.de")).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(emailDomainMatches("not-an-email", "tum.de")).toBe(false);
  });
});

describe("extractDomain", () => {
  it("returns the lowercased domain part", () => {
    expect(extractDomain("Student@TUM.DE")).toBe("tum.de");
  });

  it("returns null when there is no @", () => {
    expect(extractDomain("nope")).toBeNull();
  });
});

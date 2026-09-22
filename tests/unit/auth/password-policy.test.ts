import { describe, expect, it } from "vitest";
import { checkPasswordPolicy } from "@/server/modules/auth/domain/password-policy";

const context = {
  minLength: 12,
  maxLength: 128,
  contextBlocklist: ["Aheadly", "jane", "Jane Doe"],
};

describe("checkPasswordPolicy", () => {
  it("accepts a password meeting every rule", () => {
    expect(checkPasswordPolicy("correct horse battery staple", context)).toEqual([]);
  });

  it("rejects passwords shorter than the configured minimum", () => {
    const errors = checkPasswordPolicy("short1", context);
    expect(errors).toEqual([expect.objectContaining({ path: "password", code: "too_small" })]);
  });

  it("rejects passwords longer than the maximum", () => {
    const errors = checkPasswordPolicy("a".repeat(200), context);
    expect(errors.some((e) => e.code === "too_big")).toBe(true);
  });

  it("rejects passwords containing a blocklisted term, case-insensitively", () => {
    const errors = checkPasswordPolicy("myPasswordJaneDoeIsGreat", context);
    expect(errors.some((e) => e.code === "context_match")).toBe(true);
  });

  it("ignores blocklist terms shorter than 3 characters", () => {
    const shortContext = { ...context, contextBlocklist: ["ab"] };
    expect(checkPasswordPolicy("a long enough password with ab in it", shortContext)).toEqual([]);
  });
});

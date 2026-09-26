import { describe, expect, it } from "vitest";
import { ApiError } from "@/ui/api";
import { safeReturnTo, signInHref } from "@/ui/navigation";

describe("safeReturnTo (open-redirect guard, docs/11 §5)", () => {
  it("keeps same-site paths", () => {
    expect(safeReturnTo("/dashboard/settings")).toBe("/dashboard/settings");
    expect(safeReturnTo("/mentors?q=system+design")).toBe("/mentors?q=system+design");
  });

  it.each([
    ["https://evil.example/phish"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["dashboard"],
    ["/dash\nboard"],
    [""],
    [null],
    [undefined],
  ])("falls back for %j", (value) => {
    expect(safeReturnTo(value)).toBe("/dashboard");
  });

  it("builds sign-in links with the return path and reason", () => {
    expect(signInHref("/dashboard/settings", "reauth")).toBe(
      "/sign-in?returnTo=%2Fdashboard%2Fsettings&reason=reauth",
    );
    expect(signInHref()).toBe("/sign-in");
  });
});

describe("ApiError", () => {
  it("maps schema and domain field errors to the same keys", () => {
    const error = new ApiError(422, {
      code: "VALIDATION_FAILED",
      title: "Some fields need attention",
      errors: [
        { path: "body.email", code: "invalid_format", message: "Invalid email address" },
        {
          path: "password",
          code: "too_short",
          message: "Password must be at least 12 characters.",
        },
        { path: "body.email", code: "too_big", message: "second message is ignored" },
      ],
    });
    expect(error.fieldErrors()).toEqual({
      email: "Invalid email address",
      password: "Password must be at least 12 characters.",
    });
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  it("prefers the problem detail, then the title, then a status-based message", () => {
    expect(new ApiError(400, { detail: "Specific", title: "General" }).message).toBe("Specific");
    expect(new ApiError(400, { title: "General" }).message).toBe("General");
    expect(new ApiError(429, null).message).toMatch(/Too many attempts/);
    expect(new ApiError(503, null).message).toMatch(/on our side/);
  });
});

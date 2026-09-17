import { describe, expect, it } from "vitest";
import { redactAuditMetadata } from "@/server/platform/audit";
import { randomToken, safeEqual, verifyBearer } from "@/server/platform/crypto";
import { AppError, ERROR_CATALOG, toProblem } from "@/server/platform/errors";
import { retryDelayMs, summarizeJobError } from "@/server/platform/outbox/backoff";

describe("problem details", () => {
  it("maps app errors with safe detail, field errors and extensions", () => {
    const problem = toProblem(
      new AppError("VALIDATION_FAILED", {
        detail: "Check the title.",
        errors: [{ path: "body.title", code: "too_small", message: "Too short" }],
        extensions: { reason: "x", status: 200, code: "HACK" },
      }),
      { instance: "/api/v1/things", requestId: "req-1" },
    );
    expect(problem).toEqual({
      reason: "x",
      type: "https://docs.aheadly.invalid/problems/validation-failed",
      title: ERROR_CATALOG.VALIDATION_FAILED.title,
      status: 422,
      code: "VALIDATION_FAILED",
      detail: "Check the title.",
      instance: "/api/v1/things",
      requestId: "req-1",
      errors: [{ path: "body.title", code: "too_small", message: "Too short" }],
    });
  });

  it("never exposes unknown error messages", () => {
    const problem = toProblem(
      new Error("connection to 10.0.0.5 failed: password authentication failed"),
    );
    expect(problem).toMatchObject({ code: "INTERNAL", status: 500 });
    expect(JSON.stringify(problem)).not.toMatch(/10\.0\.0\.5|password/);
  });

  it("keeps catalog statuses in valid HTTP error ranges", () => {
    for (const { status } of Object.values(ERROR_CATALOG)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });
});

describe("crypto helpers", () => {
  it("compares secrets in constant time regardless of length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("verifies bearer tokens strictly", () => {
    const secret = randomToken();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(verifyBearer(`bearer ${secret}`, secret)).toBe(false);
    expect(verifyBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(verifyBearer(null, secret)).toBe(false);
    expect(verifyBearer("Bearer short", "short")).toBe(false);
  });
});

describe("audit metadata redaction", () => {
  it("redacts credential-like keys recursively and truncates huge strings", () => {
    const redacted = redactAuditMetadata({
      password: "p",
      nested: { accountNumber: "123", items: [{ cvv: "999", ok: 1 }] },
      note: "x".repeat(3000),
    }) as Record<string, unknown>;
    expect(redacted).toMatchObject({
      password: "[REDACTED]",
      nested: { accountNumber: "[REDACTED]", items: [{ cvv: "[REDACTED]", ok: 1 }] },
    });
    expect((redacted.note as string).length).toBeLessThanOrEqual(2001);
  });
});

describe("job retry backoff", () => {
  it("follows the documented schedule with bounded jitter", () => {
    const noJitter = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 9].map((attempt) => retryDelayMs(attempt, noJitter) / 1000)).toEqual([
      60, 300, 1800, 7200, 43200, 86400, 86400,
    ]);
    expect(retryDelayMs(1, () => 0)).toBe(54_000);
    expect(retryDelayMs(1, () => 0.999999)).toBeLessThanOrEqual(66_000);
  });

  it("truncates stored error messages", () => {
    expect(summarizeJobError(new TypeError("x".repeat(1000))).length).toBeLessThanOrEqual(501);
    expect(summarizeJobError("plain")).toBe("plain");
  });
});

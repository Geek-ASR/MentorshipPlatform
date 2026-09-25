import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import pino from "pino";
import { REDACT_PATHS } from "@/server/platform/logger";

/**
 * docs/11 §2/§10: email addresses and other confidential/restricted fields must be redacted from
 * logs. `REDACT_PATHS` is a plain array — easy to add a field to and forget to verify it actually
 * gets masked at the field name a real call site uses (exactly what happened with the console email
 * adapter logging `to` instead of `email`, docs/19 Phase 14 finding). This drives real pino output
 * through the same redact config `createLogger` uses, rather than just inspecting the array.
 */
function captureLogLine(write: (logger: pino.Logger) => void): Record<string, unknown> {
  let captured = "";
  const stream = new Writable({
    write(chunk, _enc, callback) {
      captured += chunk.toString();
      callback();
    },
  });
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } }, stream);
  write(logger);
  return JSON.parse(captured) as Record<string, unknown>;
}

describe("logger redaction (docs/11 §2/§10)", () => {
  it("redacts a top-level email field", () => {
    const line = captureLogLine((logger) => logger.info({ email: "student@example.com" }, "x"));
    expect(line.email).toBe("[REDACTED]");
  });

  it("redacts an email field nested one level deep", () => {
    const line = captureLogLine((logger) =>
      logger.info({ user: { email: "student@example.com" } }, "x"),
    );
    expect((line.user as { email: string }).email).toBe("[REDACTED]");
  });

  it("redacts password, token, secret and cookie fields", () => {
    const line = captureLogLine((logger) =>
      logger.info(
        { password: "hunter2", token: "abc", secret: "xyz", headers: { cookie: "s=1" } },
        "x",
      ),
    );
    expect(line.password).toBe("[REDACTED]");
    expect(line.token).toBe("[REDACTED]");
    expect(line.secret).toBe("[REDACTED]");
    expect((line.headers as { cookie: string }).cookie).toBe("[REDACTED]");
  });

  it("does not redact unrelated fields", () => {
    const line = captureLogLine((logger) =>
      logger.info({ event: "email.sent", userId: "u1" }, "x"),
    );
    expect(line.event).toBe("email.sent");
    expect(line.userId).toBe("u1");
  });
});

import pino, { type Logger, type LoggerOptions } from "pino";
import { getRequestContext } from "./request-context";

/**
 * Structured JSON logging. Sensitive fields are redacted by path; never log message bodies,
 * tokens, passwords, secrets, payment instruments or document contents.
 */
export const REDACT_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "signature",
  "*.signature",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "headers.authorization",
  "headers.cookie",
  "*.headers.authorization",
  "*.headers.cookie",
  "email",
  "*.email",
  "vpa",
  "*.vpa",
  "body",
  "*.body",
];

export function createLogger(
  options: { level?: LoggerOptions["level"]; base?: Record<string, unknown> } = {},
): Logger {
  return pino({
    level: options.level ?? "info",
    base: { service: "web", ...options.base },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    formatters: {
      level: (label) => ({ level: label }),
    },
    mixin() {
      const context = getRequestContext();
      return context ? { requestId: context.requestId } : {};
    },
  });
}

let rootLogger: Logger | undefined;

export function getLogger(): Logger {
  rootLogger ??= createLogger({ level: process.env.LOG_LEVEL ?? "info" });
  return rootLogger;
}

import { createHash } from "node:crypto";
import type { Logger } from "pino";
import type { BreachedPasswordChecker } from "../application/ports";

/**
 * Have I Been Pwned k-anonymity range API (docs/07 §4): only a 5-char SHA-1 prefix ever leaves the
 * server, never the password. Fails open (treats the password as clean) on any network problem.
 */
export function createHibpChecker(logger: Logger): BreachedPasswordChecker {
  return async (password: string) => {
    try {
      const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error(`HIBP returned ${response.status}`);
      const body = await response.text();
      return body.split("\r\n").some((line) => line.split(":")[0] === suffix);
    } catch (error) {
      logger.warn({ event: "auth.hibp_check_failed", err: error }, "breach check unavailable");
      return false;
    }
  };
}

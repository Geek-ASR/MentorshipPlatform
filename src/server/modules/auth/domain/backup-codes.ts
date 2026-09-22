import { randomBytes } from "node:crypto";
import { base32Encode } from "./base32";

/** 10 single-use MFA backup codes (docs/07 §3.6), formatted for readability. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5));
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

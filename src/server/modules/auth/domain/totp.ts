import { createHmac } from "node:crypto";
import { safeEqual } from "@/server/platform/crypto";
import { base32Encode } from "./base32";

/**
 * RFC 6238 TOTP over RFC 4226 HOTP (SHA-1/30s/6 digits — the widest authenticator-app compatibility,
 * per docs/07 §3.6). Verified against the RFC 6238 Appendix B test vectors in tests/unit.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;

function hotp(secret: Uint8Array, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function counterFor(now: Date): bigint {
  return BigInt(Math.floor(now.getTime() / 1000 / STEP_SECONDS));
}

export function generateTotp(secret: Uint8Array, now: Date): string {
  return hotp(secret, counterFor(now));
}

export type TotpVerification = { valid: boolean; counter: bigint };

/**
 * Accepts the current step and one step of clock drift either side. `lastUsedCounter` blocks replay
 * of a code already accepted (including within the same 30s window).
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  now: Date,
  lastUsedCounter: bigint | null,
): TotpVerification {
  if (!/^\d{6}$/.test(code)) return { valid: false, counter: -1n };
  const current = counterFor(now);
  for (const drift of [0, -1, 1]) {
    const counter = current + BigInt(drift);
    if (counter < 0n) continue;
    if (lastUsedCounter !== null && counter <= lastUsedCounter) continue;
    if (safeEqual(hotp(secret, counter), code)) return { valid: true, counter };
  }
  return { valid: false, counter: -1n };
}

export function totpUri(params: {
  secret: Uint8Array;
  accountLabel: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountLabel}`);
  const query = new URLSearchParams({
    secret: base32Encode(params.secret),
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

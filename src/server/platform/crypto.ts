import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Cryptographically random URL-safe token (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(key: string | Buffer, input: string | Buffer): string {
  return createHmac("sha256", key).update(input).digest("hex");
}

/**
 * Constant-time comparison of two strings of possibly different lengths.
 * Both sides are hashed first so the comparison never leaks length.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right) && a.length === b.length;
}

/** Parses `Authorization: Bearer <token>` and compares against the expected secret in constant time. */
export function verifyBearer(authorizationHeader: string | null, expectedSecret: string): boolean {
  if (!authorizationHeader) return false;
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{16,512})$/.exec(authorizationHeader.trim());
  if (!match?.[1]) return false;
  return safeEqual(match[1], expectedSecret);
}

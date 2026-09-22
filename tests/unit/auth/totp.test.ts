import { describe, expect, it } from "vitest";
import { generateTotp, verifyTotp } from "@/server/modules/auth/domain/totp";
import { base32Decode, base32Encode } from "@/server/modules/auth/domain/base32";

/** RFC 6238 Appendix B test vectors (SHA-1), truncated from 8 to our 6 digits: N mod 1e6 = (N mod 1e8) mod 1e6. */
const SECRET = new TextEncoder().encode("12345678901234567890");
const VECTORS: [number, string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

describe("totp", () => {
  it.each(VECTORS)("matches the RFC 6238 vector at %i seconds", (seconds, expected) => {
    expect(generateTotp(SECRET, new Date(seconds * 1000))).toBe(expected);
  });

  it("accepts one step of clock drift either side, rejects two", () => {
    const now = new Date(59_000);
    const code = generateTotp(SECRET, now);
    expect(verifyTotp(SECRET, code, new Date(59_000 + 30_000), null).valid).toBe(true);
    expect(verifyTotp(SECRET, code, new Date(59_000 - 30_000), null).valid).toBe(true);
    expect(verifyTotp(SECRET, code, new Date(59_000 + 90_000), null).valid).toBe(false);
  });

  it("rejects malformed codes without throwing", () => {
    expect(verifyTotp(SECRET, "abc", new Date(), null).valid).toBe(false);
    expect(verifyTotp(SECRET, "12", new Date(), null).valid).toBe(false);
  });

  it("blocks replay of an already-accepted counter", () => {
    const now = new Date(59_000);
    const code = generateTotp(SECRET, now);
    const first = verifyTotp(SECRET, code, now, null);
    expect(first.valid).toBe(true);
    const replay = verifyTotp(SECRET, code, now, first.counter);
    expect(replay.valid).toBe(false);
  });
});

describe("base32", () => {
  it.each([
    [new TextEncoder().encode(""), ""],
    [new TextEncoder().encode("f"), "MY"],
    [new TextEncoder().encode("foobar"), "MZXW6YTBOI"],
  ])("round-trips RFC 4648 test vectors", (bytes, expected) => {
    expect(base32Encode(bytes)).toBe(expected);
    expect(Buffer.from(base32Decode(expected))).toEqual(Buffer.from(bytes));
  });
});

import { describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret } from "@/server/modules/auth/infra/totp-encryption";

/**
 * docs/11 §9.5 / ASVS 11.4.4 (docs/security/asvs-l2-checklist.md): AES-256-GCM at rest for TOTP
 * secrets, key derived via HKDF — previously had no dedicated test coverage at all.
 */
describe("TOTP secret encryption at rest", () => {
  const masterSecret = "a".repeat(32);
  const secret = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  it("round-trips: decrypting what was encrypted returns the original secret", () => {
    const encrypted = encryptTotpSecret(secret, masterSecret);
    const decrypted = decryptTotpSecret(encrypted, masterSecret);
    expect(Array.from(decrypted)).toEqual(Array.from(secret));
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const first = encryptTotpSecret(secret, masterSecret);
    const second = encryptTotpSecret(secret, masterSecret);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
  });

  it("fails to decrypt with the wrong master secret (authenticated encryption)", () => {
    const encrypted = encryptTotpSecret(secret, masterSecret);
    expect(() => decryptTotpSecret(encrypted, "b".repeat(32))).toThrow();
  });

  it("fails to decrypt a tampered ciphertext", () => {
    const encrypted = encryptTotpSecret(secret, masterSecret);
    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -2) + "AA" };
    expect(() => decryptTotpSecret(tampered, masterSecret)).toThrow();
  });
});

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption at rest for TOTP secrets (docs/07 §3.6). Key is derived from env, never
 * stored, via HKDF (RFC 5869, ASVS 11.4.4) rather than a bare SHA-256 hash — `MFA_ENCRYPTION_KEY`
 * is already a high-entropy random secret (32+ chars, `envSchema`), not a human password, so this
 * isn't stretching a weak input; HKDF still buys real domain separation (the `info` string below)
 * so the same env secret can't be replayed as a key for an unrelated purpose, and it's the standard,
 * crypto-agile way to expand key material rather than a one-off hash construction.
 */
export type EncryptedSecret = { ciphertext: string; iv: string; tag: string };

function deriveKey(masterSecret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterSecret, Buffer.alloc(0), "aheadly:totp-secret:v1", 32),
  );
}

export function encryptTotpSecret(secret: Uint8Array, masterSecret: string): EncryptedSecret {
  const key = deriveKey(masterSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptTotpSecret(encrypted: EncryptedSecret, masterSecret: string): Uint8Array {
  const key = deriveKey(masterSecret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
    decipher.final(),
  ]);
}

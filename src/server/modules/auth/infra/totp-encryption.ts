import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM encryption at rest for TOTP secrets (docs/07 §3.6). Key is derived from env, never stored. */
export type EncryptedSecret = { ciphertext: string; iv: string; tag: string };

function deriveKey(masterSecret: string): Buffer {
  return createHash("sha256").update(masterSecret).digest();
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

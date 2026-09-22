import {
  decryptTotpSecret as decrypt,
  encryptTotpSecret as encrypt,
} from "../infra/totp-encryption";
import type { TwoFactorRow } from "../infra/mfa-repo";

export function decryptTotpSecret(
  row: Pick<TwoFactorRow, "secretCiphertext" | "secretIv" | "secretTag">,
  masterKey: string,
): Uint8Array {
  return decrypt(
    { ciphertext: row.secretCiphertext, iv: row.secretIv, tag: row.secretTag },
    masterKey,
  );
}

export function encryptTotpSecretForStorage(secret: Uint8Array, masterKey: string) {
  return encrypt(secret, masterKey);
}

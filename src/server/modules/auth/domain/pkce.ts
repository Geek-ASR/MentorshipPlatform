import { createHash } from "node:crypto";

/** RFC 7636 PKCE S256 code challenge. */
export function pkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

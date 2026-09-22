import type { Env } from "@/config/env";
import { brand } from "@/config/brand";

const COOKIE_NAME_BASE = `${brand.cookiePrefix}_oauth_state`;
const TTL_SECONDS = 10 * 60;

export type OAuthPendingState = {
  state: string;
  codeVerifier: string;
  nonce: string;
  birthYear: number;
  termsVersion: string;
  privacyVersion: string;
};

function cookieName(env: Env): string {
  return env.APP_ENV === "production" ? `__Host-${COOKIE_NAME_BASE}` : COOKIE_NAME_BASE;
}

export function buildOAuthStateCookie(pending: OAuthPendingState, env: Env): string {
  const value = encodeURIComponent(JSON.stringify(pending));
  const parts = [
    `${cookieName(env)}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${TTL_SECONDS}`,
  ];
  if (env.APP_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildClearOAuthStateCookie(env: Env): string {
  const parts = [`${cookieName(env)}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (env.APP_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function readOAuthStateCookie(headers: Headers, env: Env): OAuthPendingState | null {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return null;
  const name = cookieName(env);
  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    if (part.slice(0, separatorIndex).trim() !== name) continue;
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(part.slice(separatorIndex + 1).trim()));
      if (
        parsed &&
        typeof parsed === "object" &&
        "state" in parsed &&
        "codeVerifier" in parsed &&
        "nonce" in parsed &&
        "birthYear" in parsed &&
        "termsVersion" in parsed &&
        "privacyVersion" in parsed
      ) {
        return parsed as OAuthPendingState;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

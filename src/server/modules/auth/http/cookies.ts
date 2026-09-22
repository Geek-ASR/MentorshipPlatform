import type { Env } from "@/config/env";
import { brand } from "@/config/brand";

/**
 * `__Host-` prefixed cookies require Secure + Path=/ + no Domain, which needs HTTPS — so the prefix
 * only applies once we're actually running in production (docs/07 §5).
 */
export function sessionCookieName(env: Env): string {
  return env.APP_ENV === "production"
    ? `__Host-${brand.cookiePrefix}_session`
    : `${brand.cookiePrefix}_session`;
}

export function buildSessionCookie(token: string, expiresAt: Date, env: Env): string {
  const parts = [
    `${sessionCookieName(env)}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (env.APP_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie(env: Env): string {
  const parts = [`${sessionCookieName(env)}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (env.APP_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function readSessionToken(headers: Headers, env: Env): string | null {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return null;
  const name = sessionCookieName(env);
  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    if (part.slice(0, separatorIndex).trim() === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }
  return null;
}

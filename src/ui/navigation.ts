/**
 * Open-redirect guard for `?returnTo=` (docs/11 §5): only same-site absolute paths are honoured —
 * never a scheme, a protocol-relative `//host` or a backslash trick — everything else falls back.
 */
export function safeReturnTo(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  for (const char of value) if (char.charCodeAt(0) < 0x20) return fallback;
  return value;
}

export function signInHref(returnTo?: string, reason?: "reauth" | "expired"): string {
  const params = new URLSearchParams();
  if (returnTo) params.set("returnTo", returnTo);
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `/sign-in?${query}` : "/sign-in";
}

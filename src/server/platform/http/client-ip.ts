import { isIP } from "node:net";

/**
 * Reads the client IP only from a header the hosting platform is known to overwrite
 * (configured via CLIENT_IP_HEADER). Arbitrary X-Forwarded-For values are never trusted.
 */
export function getClientIp(headers: Headers, trustedHeader: string | undefined): string | null {
  if (!trustedHeader) return null;
  const raw = headers.get(trustedHeader);
  if (!raw) return null;
  // Some platforms append proxies; the first entry is the client when the platform owns the header.
  const candidate = raw.split(",")[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

function expandIpv6(address: string): string[] {
  const [head = "", tail = ""] = address.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = address.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  return [...headParts, ...Array<string>(missing).fill("0"), ...tailParts].map((part) =>
    part.padStart(4, "0"),
  );
}

/** Key used for per-client rate limiting: full IPv4, or the IPv6 /64 a single subscriber usually controls. */
export function rateLimitKeyForIp(ip: string | null): string {
  if (!ip) return "ip:unknown";
  if (isIP(ip) === 4) return `ip:${ip}`;
  return `ip6:${expandIpv6(ip).slice(0, 4).join(":")}::/64`;
}

/** Coarse prefix stored in audit logs (IPv4 /24, IPv6 /48) — enough for abuse analysis, not identification. */
export function auditIpPrefix(ip: string | null): string | null {
  if (!ip) return null;
  if (isIP(ip) === 4) {
    const octets = ip.split(".");
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  const groups = expandIpv6(ip).slice(0, 3);
  return `${groups.join(":")}::/48`;
}

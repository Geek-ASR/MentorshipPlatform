/**
 * Meeting-link validation (docs/09 §12): `https:` only, parsed with the WHATWG URL parser, and the
 * hostname must exactly match — or be a subdomain of — an allowlisted meeting provider. Links with
 * embedded credentials, IP-literal hosts, non-default ports or punycode (lookalike) labels are
 * rejected. The allowlist itself is an admin setting (`meeting.link_allowlist`).
 */

export type MeetingLinkCheck =
  | { ok: true; url: string }
  | {
      ok: false;
      reason:
        "invalid" | "not_https" | "credentials" | "ip_host" | "port" | "punycode" | "not_allowed";
    };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function checkMeetingLink(raw: string, allowlist: readonly string[]): MeetingLinkCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const hostname = url.hostname.toLowerCase();
  if (IPV4.test(hostname) || hostname.startsWith("[")) return { ok: false, reason: "ip_host" };
  // The WHATWG parser drops a port that equals the scheme default, so any port left is non-default.
  if (url.port !== "") return { ok: false, reason: "port" };
  if (hostname.split(".").some((label) => label.startsWith("xn--"))) {
    return { ok: false, reason: "punycode" };
  }
  const allowed = allowlist.some((entry) => {
    const host = entry.toLowerCase();
    return hostname === host || hostname.endsWith(`.${host}`);
  });
  if (!allowed) return { ok: false, reason: "not_allowed" };
  return { ok: true, url: url.toString() };
}

export const MEETING_LINK_MESSAGES: Record<
  Exclude<MeetingLinkCheck, { ok: true }>["reason"],
  string
> = {
  invalid: "That doesn't look like a web link.",
  not_https: "Use a secure link that starts with https://.",
  credentials: "Remove the username or password from the link.",
  ip_host: "Use your meeting provider's link, not an IP address.",
  port: "Use the provider's normal link, without a port number.",
  punycode: "That web address isn't accepted.",
  not_allowed:
    "Use a Google Meet, Zoom, Microsoft Teams, Whereby or Jitsi link — other providers aren't supported yet.",
};

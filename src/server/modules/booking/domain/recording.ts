/**
 * Recording URL allowlist (docs/09 §9: "host posts a URL, validated allowlist, e.g. YouTube/Drive/
 * Vimeo"). Mirrors the meeting-link validation discipline docs/09 §12 established for join URLs —
 * https-only, no embedded credentials, no bare IP literal, no punycode — restricted to the three
 * named hosts instead of a mentor-configurable meeting-provider list.
 */
const ALLOWED_RECORDING_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "drive.google.com",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
]);

const IP_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isAllowedRecordingUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const hostname = url.hostname.toLowerCase();
  if (IP_LITERAL.test(hostname) || hostname.startsWith("xn--")) return false;
  return ALLOWED_RECORDING_HOSTS.has(hostname);
}

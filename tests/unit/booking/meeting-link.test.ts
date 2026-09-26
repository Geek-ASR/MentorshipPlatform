import { describe, expect, it } from "vitest";
import { checkMeetingLink } from "@/server/modules/booking/domain/meeting-link";

const ALLOWLIST = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
  "whereby.com",
  "meet.jit.si",
];

describe("meeting links (docs/09 §12)", () => {
  it.each([
    "https://meet.google.com/abc-defg-hij",
    "https://zoom.us/j/1234567890?pwd=abc",
    "https://us02web.zoom.us/j/1234567890",
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting",
    "https://whereby.com/aheadly-room",
    "https://meet.jit.si/AheadlyDemoRoom",
    "https://meet.google.com:443/abc-defg-hij",
  ])("accepts %s", (url) => {
    expect(checkMeetingLink(url, ALLOWLIST).ok).toBe(true);
  });

  it.each([
    ["http://meet.google.com/abc", "not_https"],
    ["https://user:pass@meet.google.com/abc", "credentials"],
    ["https://attacker@zoom.us/j/1", "credentials"],
    ["https://142.250.183.14/abc", "ip_host"],
    ["https://[2001:db8::1]/abc", "ip_host"],
    ["https://zoom.us:8443/j/1", "port"],
    ["https://xn--zm-8ka.us/j/1", "punycode"],
    ["https://meet.google.com.evil.example/abc", "not_allowed"],
    ["https://evilzoom.us/j/1", "not_allowed"],
    ["https://example.com/zoom.us", "not_allowed"],
    ["javascript:alert(1)", "not_https"],
    ["not a url", "invalid"],
  ])("rejects %s (%s)", (url, reason) => {
    expect(checkMeetingLink(url, ALLOWLIST)).toEqual({ ok: false, reason });
  });

  it("normalises what it accepts", () => {
    expect(checkMeetingLink("  https://MEET.jit.si/Room  ", ALLOWLIST)).toEqual({
      ok: true,
      url: "https://meet.jit.si/Room",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  isSessionExpired,
  sessionLifetimeFor,
  shouldRefreshLastSeen,
} from "@/server/modules/auth/domain/session-policy";

describe("sessionLifetimeFor", () => {
  it("gives staff much shorter idle and absolute lifetimes than regular users", () => {
    const staff = sessionLifetimeFor(true);
    const regular = sessionLifetimeFor(false);
    expect(staff.idleMs).toBeLessThan(regular.idleMs);
    expect(staff.absoluteMs).toBeLessThan(regular.absoluteMs);
  });
});

describe("isSessionExpired", () => {
  const base = {
    lastSeenAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2026-02-01T00:00:00Z"),
    revokedAt: null,
  };

  it("is expired once revoked, regardless of other fields", () => {
    expect(
      isSessionExpired({ ...base, revokedAt: new Date() }, false, new Date("2026-01-02T00:00:00Z")),
    ).toBe(true);
  });

  it("is expired past the absolute lifetime", () => {
    expect(isSessionExpired(base, false, new Date("2026-03-01T00:00:00Z"))).toBe(true);
  });

  it("is expired past the idle window even before the absolute lifetime", () => {
    const now = new Date(base.lastSeenAt.getTime() + 8 * 86_400_000); // regular idle is 7 days
    expect(isSessionExpired(base, false, now)).toBe(true);
  });

  it("is active within both windows", () => {
    const now = new Date(base.lastSeenAt.getTime() + 60_000);
    expect(isSessionExpired(base, false, now)).toBe(false);
  });

  it("applies the much shorter staff idle window", () => {
    const now = new Date(base.lastSeenAt.getTime() + 2 * 3_600_000); // 2h > staff's 1h idle
    expect(isSessionExpired(base, true, now)).toBe(true);
  });
});

describe("shouldRefreshLastSeen", () => {
  it("only refreshes after the minimum interval has passed", () => {
    const lastSeenAt = new Date("2026-01-01T00:00:00Z");
    expect(shouldRefreshLastSeen(lastSeenAt, new Date(lastSeenAt.getTime() + 60_000))).toBe(false);
    expect(shouldRefreshLastSeen(lastSeenAt, new Date(lastSeenAt.getTime() + 25 * 3_600_000))).toBe(
      true,
    );
  });
});

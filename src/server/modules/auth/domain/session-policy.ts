/** Session lifetime rules (docs/07 §5). Staff accounts get much shorter sessions. */
const REGULAR_IDLE_DAYS = 7;
const REGULAR_ABSOLUTE_DAYS = 30;
const STAFF_IDLE_HOURS = 1;
const STAFF_ABSOLUTE_HOURS = 12;
/** Sliding idle expiry is only pushed out at most this often, to avoid a write on every request. */
export const SESSION_REFRESH_MIN_INTERVAL_HOURS = 24;

export type SessionLifetime = { idleMs: number; absoluteMs: number };

export function sessionLifetimeFor(isStaff: boolean): SessionLifetime {
  return isStaff
    ? { idleMs: STAFF_IDLE_HOURS * 3_600_000, absoluteMs: STAFF_ABSOLUTE_HOURS * 3_600_000 }
    : {
        idleMs: REGULAR_IDLE_DAYS * 86_400_000,
        absoluteMs: REGULAR_ABSOLUTE_DAYS * 86_400_000,
      };
}

export function isSessionExpired(
  session: { lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null },
  isStaff: boolean,
  now: Date,
): boolean {
  if (session.revokedAt) return true;
  if (now >= session.expiresAt) return true;
  const { idleMs } = sessionLifetimeFor(isStaff);
  return now.getTime() - session.lastSeenAt.getTime() > idleMs;
}

export function shouldRefreshLastSeen(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > SESSION_REFRESH_MIN_INTERVAL_HOURS * 3_600_000;
}

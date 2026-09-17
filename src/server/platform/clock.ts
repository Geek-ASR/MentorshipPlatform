/**
 * Time source for application and domain code. Never call `Date.now()` / `new Date()` directly in
 * domain logic; accept a Clock (or a `now` value) so rules are deterministic under test.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export type ManualClock = Clock & {
  set(date: Date | string): void;
  advance(ms: number): void;
};

export function manualClock(start: Date | string = "2026-01-01T00:00:00.000Z"): ManualClock {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set: (date) => {
      current = new Date(date);
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

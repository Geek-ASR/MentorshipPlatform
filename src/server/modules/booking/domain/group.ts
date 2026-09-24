/**
 * Pure group-session math (docs/09 §8). No I/O — the caller loads commission rates, capacity and
 * seat counts and this file only judges the numbers, matching the eligibility-gate/attendance
 * split already established elsewhere in this module.
 */

/**
 * Derives a per-seat price from a mentor's target total (docs/09 §8 worked example: ₹2,400 / 4
 * seats → ₹600/seat), rounding up so the mentor never nets less than their target at full capacity.
 * The earnings-at-min/max-fill preview docs/09 §8 also wants isn't computed here — it needs the real
 * commission quote (fixed fees and min/max clamps make it more than a flat multiply), so the
 * application layer derives it by calling `payments.quoteBooking` once at this seat price.
 */
export function deriveSeatPriceMinor(targetTotalMinor: number, capacity: number): number {
  return Math.ceil(targetTotalMinor / capacity);
}

/** docs/18 B25: a mentor may never lower capacity below the seats already confirmed/held. */
export function canReduceCapacity(newCapacity: number, currentLiveSeatCount: number): boolean {
  return newCapacity >= currentLiveSeatCount;
}

/** docs/09 §8: the min-participants check's own pass/fail judgment, isolated for unit testing. */
export function isMinimumMet(liveSeatCount: number, minParticipants: number): boolean {
  return liveSeatCount >= minParticipants;
}

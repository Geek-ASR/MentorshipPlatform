import {
  addMinutes,
  localDateKey,
  localDatesOverlapping,
  localDateToKey,
  toInstant,
  weekdayOfLocalDate,
  type LocalTime,
} from "./time";

/** Weekly recurring window (docs/09 §2). Wall-clock; re-interpreted against the tz at query time. */
export type AvailabilityRule = {
  weekday: number; // ISO 1 (Mon) - 7 (Sun)
  startLocal: LocalTime;
  endLocal: LocalTime;
  /** `YYYY-MM-DD`, inclusive. */
  effectiveFrom: string;
  /** `YYYY-MM-DD`, inclusive, or null for open-ended. */
  effectiveTo: string | null;
};

/** Absolute (already-resolved) window: a vacation block or an ad-hoc extra opening. */
export type AvailabilityException = {
  kind: "unavailable" | "extra_available";
  start: Date;
  end: Date;
};

export type ActiveBlock = { start: Date; end: Date };

export type Slot = { start: Date; end: Date };

export type SlotGenerationInput = {
  timeZone: string;
  durationMin: number;
  slotStepMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  maxSessionsPerDay: number;
  /** Query window requested by the caller. */
  from: Date;
  to: Date;
  now: Date;
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
  /** Active calendar blocks for this mentor, `during` already including their buffer. */
  activeBlocks: readonly ActiveBlock[];
  /** Count of live sessions already on each mentor-local date (`YYYY-MM-DD` -> count). */
  sessionCountByLocalDate: ReadonlyMap<string, number>;
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function ruleEffectiveOn(rule: AvailabilityRule, dateKey: string): boolean {
  if (dateKey < rule.effectiveFrom) return false;
  if (rule.effectiveTo !== null && dateKey > rule.effectiveTo) return false;
  return true;
}

function stepWindow(
  windowStart: Date,
  windowEnd: Date,
  durationMin: number,
  stepMin: number,
): Slot[] {
  const slots: Slot[] = [];
  let cursor = windowStart;
  let guard = 0;
  while (addMinutes(cursor, durationMin) <= windowEnd) {
    if (guard++ > 5000) throw new Error("stepWindow: iteration guard exceeded");
    slots.push({ start: cursor, end: addMinutes(cursor, durationMin) });
    cursor = addMinutes(cursor, stepMin);
  }
  return slots;
}

/**
 * Pure slot generation (docs/09 §4). Computed server-side, advisory only — the booking transaction
 * re-validates everything against fresh reads, so a stale slot list can never cause a double book.
 */
export function generateAvailableSlots(input: SlotGenerationInput): Slot[] {
  const earliestStart = addMinutes(input.now, input.minNoticeMin);
  const latestStart = addMinutes(input.now, input.maxAdvanceDays * 1440);
  const windowStart = input.from > earliestStart ? input.from : earliestStart;
  const windowEnd = input.to < latestStart ? input.to : latestStart;
  if (windowStart >= windowEnd) return [];

  let candidates: Slot[] = [];

  for (const date of localDatesOverlapping(windowStart, windowEnd, input.timeZone)) {
    const dateKey = localDateToKey(date);
    const weekday = weekdayOfLocalDate(date);
    for (const rule of input.rules) {
      if (rule.weekday !== weekday || !ruleEffectiveOn(rule, dateKey)) continue;
      const winStart = toInstant(date, rule.startLocal, input.timeZone, "compatible");
      const winEnd = toInstant(date, rule.endLocal, input.timeZone, "later");
      candidates.push(...stepWindow(winStart, winEnd, input.durationMin, input.slotStepMin));
    }
  }

  for (const exception of input.exceptions) {
    if (exception.kind !== "extra_available") continue;
    candidates.push(
      ...stepWindow(exception.start, exception.end, input.durationMin, input.slotStepMin),
    );
  }

  const unavailable = input.exceptions.filter((e) => e.kind === "unavailable");
  candidates = candidates.filter(
    (slot) => !unavailable.some((e) => overlaps(slot.start, slot.end, e.start, e.end)),
  );

  candidates = candidates.filter((slot) => {
    const bufferedEnd = addMinutes(slot.end, input.bufferAfterMin);
    return !input.activeBlocks.some((block) =>
      overlaps(slot.start, bufferedEnd, block.start, block.end),
    );
  });

  candidates = candidates.filter((slot) => {
    const count = input.sessionCountByLocalDate.get(localDateKey(slot.start, input.timeZone)) ?? 0;
    return count < input.maxSessionsPerDay;
  });

  candidates = candidates.filter((slot) => slot.start >= windowStart && slot.end <= windowEnd);

  return candidates
    .filter(
      (slot, index, all) =>
        all.findIndex((s) => s.start.getTime() === slot.start.getTime()) === index,
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

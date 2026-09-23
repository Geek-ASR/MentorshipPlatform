/**
 * Refund/reversal recomputation (docs/08 §8). The refund *amount* comes from business rules
 * (docs/17) evaluated against the booking's policy snapshot — this module only re-runs the
 * *already-snapshotted* commission rule against what's left, so a partial refund's commission and
 * mentor-share split stay internally consistent without re-resolving which rule applies (a later
 * rule change must never leak into an existing order item, matching docs/08 §7.3 point 4).
 */
export type SnapshottedCommission = {
  percentBps: number;
  fixedMinor: number;
  minFeeMinor: number | null;
  maxFeeMinor: number | null;
};

export type RefundRecomputeInput = {
  originalBaseMinor: number;
  originalCommissionMinor: number;
  originalMentorShareMinor: number;
  refundMinor: number;
  commission: SnapshottedCommission;
};

export type RefundRecomputeResult = {
  retainedMinor: number;
  commissionAfterMinor: number;
  mentorShareAfterMinor: number;
  /** Amount to claw back from the mentor's transfer (0 if the refund doesn't touch their share). */
  mentorReversalMinor: number;
  /** Amount to claw back from commission revenue. */
  commissionReversalMinor: number;
};

function clamp(value: number, min: number | null, max: number | null): number {
  let result = value;
  if (min !== null) result = Math.max(result, min);
  if (max !== null) result = Math.min(result, max);
  return result;
}

export function recomputeAfterRefund(input: RefundRecomputeInput): RefundRecomputeResult {
  const retainedMinor = input.originalBaseMinor - input.refundMinor;
  const raw =
    Math.floor((retainedMinor * input.commission.percentBps) / 10_000) +
    input.commission.fixedMinor;
  const commissionAfterMinor = Math.min(
    clamp(raw, input.commission.minFeeMinor, input.commission.maxFeeMinor),
    Math.max(retainedMinor, 0),
  );
  const mentorShareAfterMinor = retainedMinor - commissionAfterMinor;
  return {
    retainedMinor,
    commissionAfterMinor,
    mentorShareAfterMinor,
    mentorReversalMinor: input.originalMentorShareMinor - mentorShareAfterMinor,
    commissionReversalMinor: input.originalCommissionMinor - commissionAfterMinor,
  };
}

/**
 * Dispute resolution refund math (docs/10 §8). Pure — the caller (application layer) decides *which*
 * resolution applies from the evidence comparison; this only turns that decision into a minor-unit
 * amount. The money is *executed* by payments' already-built `refundOrderItem`/`recomputeAfterRefund`
 * (Phase 8) — this module only decides the percentage, never touches the ledger itself.
 */
import type { DisputeResolution } from "./types";

export function resolveRefundPct(resolution: DisputeResolution, balancedSplitPct: number): number {
  switch (resolution) {
    case "full_refund":
      return 100;
    case "no_refund":
      return 0;
    case "partial_refund":
      return balancedSplitPct;
  }
}

export function refundMinorFor(priceMinor: number, refundPct: number): number {
  return Math.round((priceMinor * refundPct) / 100);
}

/**
 * docs/10 §8's worked "I paid but mentor never attended" example: both claim absence, compare join
 * signals. Neither signaled -> full refund, no fault attributed. Only one signaled -> favour them
 * (full refund if the student signaled and mentor didn't; no refund if the reverse). Both or neither
 * distinctly signaled in a way that doesn't clearly favour one side -> a balanced split.
 */
export function evidenceFavoredResolution(input: {
  studentSignaled: boolean;
  mentorSignaled: boolean;
}): DisputeResolution {
  if (!input.studentSignaled && !input.mentorSignaled) return "full_refund";
  if (input.studentSignaled && !input.mentorSignaled) return "full_refund";
  if (!input.studentSignaled && input.mentorSignaled) return "no_refund";
  return "partial_refund"; // both signaled -- balanced, evidence doesn't clearly favour either side.
}

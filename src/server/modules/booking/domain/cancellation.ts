/**
 * Cancellation refund policy (docs/09 §10, docs/17 §5). Pure — computes the *intended* refund
 * percentage and amount from a policy snapshot. Phase 7 has no live payments (docs/19 Phase 7
 * deviations), so for a free booking `refundMinor` is always 0; the percentage is still computed
 * correctly so Phase 8 can apply it to a real payment without touching this function.
 */
export type CancellationPolicySnapshot = {
  fullRefundHours: number;
  partialRefundHours: number;
  partialRefundPct: number;
  lateRefundPct: number;
  mentorRefundPct: number;
};

export type CancellationActor = "student" | "mentor" | "admin" | "system";

export type CancellationQuoteInput = {
  actor: CancellationActor;
  hoursNotice: number;
  priceMinor: number;
  policy: CancellationPolicySnapshot;
  /** True when the student has not already used their rolling-90-day courtesy late-cancel. */
  courtesyAvailable: boolean;
};

export type CancellationQuote = {
  refundPct: number;
  refundMinor: number;
  usedCourtesy: boolean;
  window: "full" | "partial" | "late" | "not_applicable";
};

function roundMinor(priceMinor: number, pct: number): number {
  return Math.round((priceMinor * pct) / 100);
}

export function cancellationQuote(input: CancellationQuoteInput): CancellationQuote {
  if (input.actor !== "student") {
    const pct = input.actor === "mentor" ? input.policy.mentorRefundPct : 100;
    return {
      refundPct: pct,
      refundMinor: roundMinor(input.priceMinor, pct),
      usedCourtesy: false,
      window: "not_applicable",
    };
  }

  if (input.hoursNotice >= input.policy.fullRefundHours) {
    return {
      refundPct: 100,
      refundMinor: roundMinor(input.priceMinor, 100),
      usedCourtesy: false,
      window: "full",
    };
  }
  if (input.hoursNotice >= input.policy.partialRefundHours) {
    return {
      refundPct: input.policy.partialRefundPct,
      refundMinor: roundMinor(input.priceMinor, input.policy.partialRefundPct),
      usedCourtesy: false,
      window: "partial",
    };
  }
  if (input.courtesyAvailable) {
    return {
      refundPct: input.policy.partialRefundPct,
      refundMinor: roundMinor(input.priceMinor, input.policy.partialRefundPct),
      usedCourtesy: true,
      window: "late",
    };
  }
  return {
    refundPct: input.policy.lateRefundPct,
    refundMinor: roundMinor(input.priceMinor, input.policy.lateRefundPct),
    usedCourtesy: false,
    window: "late",
  };
}

/** Reliability points scaled by notice given (docs/17 §5) — the audit-trail signal `trust`'s
 * ingestion poller reads uses `mentorCancellationTrustEventSignal` below for the actual typed event;
 * this stays for anywhere only the point value itself is needed. */
export function mentorCancellationNoticePoints(hoursNotice: number): number {
  if (hoursNotice >= 72) return 0;
  if (hoursNotice >= 24) return 1;
  if (hoursNotice >= 2) return 2;
  return 3;
}

/** Which typed trust event (docs/10 §4.2's three-tier cancel ladder) a mentor cancellation produces,
 * or `null` for >=72h notice — the catalog has no event at all for that band (0 points). */
export function mentorCancellationTrustEventSignal(
  hoursNotice: number,
): "mentor_cancel_24_72h" | "mentor_late_cancel_24h" | "mentor_late_cancel_2h" | null {
  if (hoursNotice >= 72) return null;
  if (hoursNotice >= 24) return "mentor_cancel_24_72h";
  if (hoursNotice >= 2) return "mentor_late_cancel_24h";
  return "mentor_late_cancel_2h";
}

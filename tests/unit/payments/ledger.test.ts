import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  captureJournal,
  chargebackLostJournal,
  goodwillRefundJournal,
  isBalanced,
  refundAfterReleaseJournal,
  refundBeforeReleaseJournal,
  transferReleasedJournal,
  transferReversalRecoveredJournal,
} from "@/server/modules/payments/domain/ledger";
import { recomputeAfterRefund } from "@/server/modules/payments/domain/refund-math";

describe("ledger journal builders balance by construction", () => {
  it("captureJournal balances", () => {
    const journal = captureJournal({
      idempotencyKey: "k1",
      mentorUserId: "m1",
      currency: "INR",
      amountMinor: 200_000,
      commissionMinor: 20_000,
      mentorShareMinor: 180_000,
    });
    expect(isBalanced(journal)).toBe(true);
  });

  it("captureJournal rejects a split that doesn't add up to the amount", () => {
    expect(() =>
      captureJournal({
        idempotencyKey: "k1",
        mentorUserId: "m1",
        currency: "INR",
        amountMinor: 200_000,
        commissionMinor: 20_000,
        mentorShareMinor: 179_999,
      }),
    ).toThrow(/must equal amountMinor/);
  });

  it("transferReleasedJournal balances", () => {
    const journal = transferReleasedJournal({
      idempotencyKey: "k2",
      mentorUserId: "m1",
      currency: "INR",
      amountMinor: 180_000,
    });
    expect(isBalanced(journal)).toBe(true);
  });

  it("refundBeforeReleaseJournal balances for a full refund", () => {
    const journal = refundBeforeReleaseJournal({
      idempotencyKey: "k3",
      mentorUserId: "m1",
      currency: "INR",
      refundMinor: 200_000,
      mentorReversalMinor: 180_000,
      commissionReversalMinor: 20_000,
    });
    expect(isBalanced(journal)).toBe(true);
  });

  it("transferReversalRecoveredJournal balances", () => {
    expect(
      isBalanced(
        transferReversalRecoveredJournal({
          idempotencyKey: "k4",
          mentorUserId: "m1",
          currency: "INR",
          mentorReversalMinor: 180_000,
        }),
      ),
    ).toBe(true);
  });

  it("refundAfterReleaseJournal balances whether or not the reversal was recovered", () => {
    const recovered = refundAfterReleaseJournal({
      idempotencyKey: "k5a",
      mentorUserId: "m1",
      currency: "INR",
      refundMinor: 200_000,
      mentorReversalMinor: 180_000,
      commissionReversalMinor: 20_000,
      reversalRecovered: true,
    });
    expect(isBalanced(recovered)).toBe(true);
    const notRecovered = refundAfterReleaseJournal({
      idempotencyKey: "k5b",
      mentorUserId: "m1",
      currency: "INR",
      refundMinor: 200_000,
      mentorReversalMinor: 180_000,
      commissionReversalMinor: 20_000,
      reversalRecovered: false,
    });
    expect(isBalanced(notRecovered)).toBe(true);
  });

  it("goodwillRefundJournal balances and never touches the mentor", () => {
    const journal = goodwillRefundJournal({
      idempotencyKey: "k6",
      currency: "INR",
      refundMinor: 50_000,
    });
    expect(isBalanced(journal)).toBe(true);
    expect(journal.lines.some((l) => l.account.kind === "mentor_payable")).toBe(false);
  });

  it("chargebackLostJournal balances", () => {
    const journal = chargebackLostJournal({
      idempotencyKey: "k7",
      currency: "INR",
      amountMinor: 200_000,
    });
    expect(isBalanced(journal)).toBe(true);
  });
});

describe("isBalanced", () => {
  it("detects an unbalanced journal", () => {
    expect(
      isBalanced({
        idempotencyKey: "bad",
        description: "test",
        lines: [
          {
            account: { kind: "psp_clearing", refId: null, currency: "INR" },
            direction: "debit",
            amountMinor: 100,
          },
          {
            account: { kind: "mentor_payable", refId: "m1", currency: "INR" },
            direction: "credit",
            amountMinor: 99,
          },
        ],
      }),
    ).toBe(false);
  });

  it("checks balance independently per currency", () => {
    expect(
      isBalanced({
        idempotencyKey: "multi-currency",
        description: "test",
        lines: [
          {
            account: { kind: "psp_clearing", refId: null, currency: "INR" },
            direction: "debit",
            amountMinor: 100,
          },
          {
            account: { kind: "psp_clearing", refId: null, currency: "EUR" },
            direction: "debit",
            amountMinor: 50,
          },
          {
            account: { kind: "mentor_payable", refId: "m1", currency: "INR" },
            direction: "credit",
            amountMinor: 100,
          },
          {
            account: { kind: "mentor_payable", refId: "m1", currency: "EUR" },
            direction: "credit",
            amountMinor: 50,
          },
        ],
      }),
    ).toBe(true);
  });
});

describe("recomputeAfterRefund + refund journals (property-based end-to-end)", () => {
  it("a full refund's recompute always yields a balanced refundBeforeReleaseJournal", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 0, max: 1_000 }),
        (baseMinor, percentBps, fixedMinor) => {
          const commission = { percentBps, fixedMinor, minFeeMinor: null, maxFeeMinor: null };
          const rawCommission = Math.min(
            Math.floor((baseMinor * percentBps) / 10_000) + fixedMinor,
            baseMinor,
          );
          const mentorShare = baseMinor - rawCommission;
          const result = recomputeAfterRefund({
            originalBaseMinor: baseMinor,
            originalCommissionMinor: rawCommission,
            originalMentorShareMinor: mentorShare,
            refundMinor: baseMinor, // full refund
            commission,
          });
          expect(result.retainedMinor).toBe(0);
          expect(result.commissionAfterMinor).toBe(0);
          expect(result.mentorShareAfterMinor).toBe(0);
          expect(result.mentorReversalMinor).toBe(mentorShare);
          expect(result.commissionReversalMinor).toBe(rawCommission);

          if (result.mentorReversalMinor > 0 || result.commissionReversalMinor > 0) {
            const journal = refundBeforeReleaseJournal({
              idempotencyKey: "prop",
              mentorUserId: "m1",
              currency: "INR",
              refundMinor: baseMinor,
              mentorReversalMinor: result.mentorReversalMinor,
              commissionReversalMinor: result.commissionReversalMinor,
            });
            expect(isBalanced(journal)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("a partial refund's retained commission+mentorShare always reconstitutes the retained amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 50_000_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        (baseMinor, percentBps) => {
          const commission = { percentBps, fixedMinor: 0, minFeeMinor: null, maxFeeMinor: null };
          const originalCommission = Math.floor((baseMinor * percentBps) / 10_000);
          const originalMentorShare = baseMinor - originalCommission;
          const refundMinor = Math.floor(baseMinor / 3); // arbitrary partial refund
          const result = recomputeAfterRefund({
            originalBaseMinor: baseMinor,
            originalCommissionMinor: originalCommission,
            originalMentorShareMinor: originalMentorShare,
            refundMinor,
            commission,
          });
          expect(result.commissionAfterMinor + result.mentorShareAfterMinor).toBe(
            result.retainedMinor,
          );
          expect(result.retainedMinor).toBe(baseMinor - refundMinor);
        },
      ),
      { numRuns: 300 },
    );
  });
});

import type { LedgerAccountKind, LedgerDirection } from "./types";

/**
 * Pure double-entry journal construction (docs/08 §9, ADR-013). These functions only describe
 * *what* to post — resolving a `LedgerAccountRef` to a real `ledger_accounts` row (get-or-create)
 * and persisting the journal is the application layer's job, so this stays framework-free and
 * exhaustively testable, including the property-based "every journal balances" tests (docs/13 §1).
 *
 * GST/TDS splitting is deliberately out of scope (docs/19 Phase 8 deviations) — the illustrative
 * ledger in docs/08 §9 includes `gst_output`/`tds_payable` lines that need CA sign-off (⚖️) before
 * this codebase asserts a tax computation; commission is posted as one line, not split further.
 */
export type LedgerAccountRef = { kind: LedgerAccountKind; refId: string | null; currency: string };

export type LedgerLineDraft = {
  account: LedgerAccountRef;
  direction: LedgerDirection;
  amountMinor: number;
};

export type LedgerJournalDraft = {
  /** Unique per business event — the DB enforces this can never post twice (docs/05 §4.3). */
  idempotencyKey: string;
  description: string;
  lines: LedgerLineDraft[];
};

function psp(currency: string): LedgerAccountRef {
  return { kind: "psp_clearing", refId: null, currency };
}
function mentorPayable(mentorUserId: string, currency: string): LedgerAccountRef {
  return { kind: "mentor_payable", refId: mentorUserId, currency };
}
function mentorReceivable(mentorUserId: string, currency: string): LedgerAccountRef {
  return { kind: "mentor_receivable", refId: mentorUserId, currency };
}
function commissionRevenue(currency: string): LedgerAccountRef {
  return { kind: "commission_revenue", refId: null, currency };
}
function refundCosts(currency: string): LedgerAccountRef {
  return { kind: "refund_costs", refId: null, currency };
}
function chargebackLosses(currency: string): LedgerAccountRef {
  return { kind: "chargeback_losses", refId: null, currency };
}

function assertPositive(amountMinor: number, label: string): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error(`${label} must be a positive integer minor-unit amount, got ${amountMinor}`);
  }
}

export type CaptureInput = {
  idempotencyKey: string;
  mentorUserId: string;
  currency: string;
  amountMinor: number;
  commissionMinor: number;
  mentorShareMinor: number;
};

/** Payment captured: money lands in clearing, split into what's owed to the mentor vs. the platform. */
export function captureJournal(input: CaptureInput): LedgerJournalDraft {
  assertPositive(input.amountMinor, "amountMinor");
  if (input.commissionMinor + input.mentorShareMinor !== input.amountMinor) {
    throw new Error("commissionMinor + mentorShareMinor must equal amountMinor");
  }
  const lines: LedgerLineDraft[] = [
    { account: psp(input.currency), direction: "debit", amountMinor: input.amountMinor },
  ];
  if (input.mentorShareMinor > 0) {
    lines.push({
      account: mentorPayable(input.mentorUserId, input.currency),
      direction: "credit",
      amountMinor: input.mentorShareMinor,
    });
  }
  if (input.commissionMinor > 0) {
    lines.push({
      account: commissionRevenue(input.currency),
      direction: "credit",
      amountMinor: input.commissionMinor,
    });
  }
  return { idempotencyKey: input.idempotencyKey, description: "Payment captured", lines };
}

export type TransferReleasedInput = {
  idempotencyKey: string;
  mentorUserId: string;
  currency: string;
  amountMinor: number;
};

/** Mentor transfer released: moves the already-recognised payable out of clearing. */
export function transferReleasedJournal(input: TransferReleasedInput): LedgerJournalDraft {
  assertPositive(input.amountMinor, "amountMinor");
  return {
    idempotencyKey: input.idempotencyKey,
    description: "Mentor transfer released",
    lines: [
      {
        account: mentorPayable(input.mentorUserId, input.currency),
        direction: "debit",
        amountMinor: input.amountMinor,
      },
      { account: psp(input.currency), direction: "credit", amountMinor: input.amountMinor },
    ],
  };
}

export type RefundBeforeReleaseInput = {
  idempotencyKey: string;
  mentorUserId: string;
  currency: string;
  refundMinor: number;
  mentorReversalMinor: number;
  commissionReversalMinor: number;
};

/** Full or partial refund while the transfer is still `on_hold` — a single reversing journal. */
export function refundBeforeReleaseJournal(input: RefundBeforeReleaseInput): LedgerJournalDraft {
  assertPositive(input.refundMinor, "refundMinor");
  const lines: LedgerLineDraft[] = [
    { account: psp(input.currency), direction: "credit", amountMinor: input.refundMinor },
  ];
  if (input.mentorReversalMinor > 0) {
    lines.push({
      account: mentorPayable(input.mentorUserId, input.currency),
      direction: "debit",
      amountMinor: input.mentorReversalMinor,
    });
  }
  if (input.commissionReversalMinor > 0) {
    lines.push({
      account: commissionRevenue(input.currency),
      direction: "debit",
      amountMinor: input.commissionReversalMinor,
    });
  }
  return {
    idempotencyKey: input.idempotencyKey,
    description: "Refund before transfer release",
    lines,
  };
}

export type TransferReversalRecoveredInput = {
  idempotencyKey: string;
  mentorUserId: string;
  currency: string;
  mentorReversalMinor: number;
};

/** Refund after release, step 1: the mentor's linked account had enough balance to claw back. */
export function transferReversalRecoveredJournal(
  input: TransferReversalRecoveredInput,
): LedgerJournalDraft {
  assertPositive(input.mentorReversalMinor, "mentorReversalMinor");
  return {
    idempotencyKey: input.idempotencyKey,
    description: "Transfer reversal recovered from mentor",
    lines: [
      { account: psp(input.currency), direction: "debit", amountMinor: input.mentorReversalMinor },
      {
        account: mentorPayable(input.mentorUserId, input.currency),
        direction: "credit",
        amountMinor: input.mentorReversalMinor,
      },
    ],
  };
}

export type RefundAfterReleaseInput = {
  idempotencyKey: string;
  mentorUserId: string;
  currency: string;
  refundMinor: number;
  mentorReversalMinor: number;
  commissionReversalMinor: number;
  /** False when the mentor's linked account balance couldn't cover the clawback — books a
   * receivable instead of debiting `mentor_payable` a second time (docs/08 §9 last two rows). */
  reversalRecovered: boolean;
};

/** Refund after release, step 2: refund the student, using a receivable if step 1 didn't recover. */
export function refundAfterReleaseJournal(input: RefundAfterReleaseInput): LedgerJournalDraft {
  assertPositive(input.refundMinor, "refundMinor");
  const mentorAccount = input.reversalRecovered
    ? mentorPayable(input.mentorUserId, input.currency)
    : mentorReceivable(input.mentorUserId, input.currency);
  const lines: LedgerLineDraft[] = [
    { account: psp(input.currency), direction: "credit", amountMinor: input.refundMinor },
  ];
  if (input.mentorReversalMinor > 0) {
    lines.push({
      account: mentorAccount,
      direction: "debit",
      amountMinor: input.mentorReversalMinor,
    });
  }
  if (input.commissionReversalMinor > 0) {
    lines.push({
      account: commissionRevenue(input.currency),
      direction: "debit",
      amountMinor: input.commissionReversalMinor,
    });
  }
  return {
    idempotencyKey: input.idempotencyKey,
    description: "Refund after transfer release",
    lines,
  };
}

export type GoodwillRefundInput = {
  idempotencyKey: string;
  currency: string;
  refundMinor: number;
};

/** Platform-funded goodwill refund: the mentor's share is left untouched (docs/08 §8 last-but-one row). */
export function goodwillRefundJournal(input: GoodwillRefundInput): LedgerJournalDraft {
  assertPositive(input.refundMinor, "refundMinor");
  return {
    idempotencyKey: input.idempotencyKey,
    description: "Goodwill refund (platform-funded)",
    lines: [
      { account: refundCosts(input.currency), direction: "debit", amountMinor: input.refundMinor },
      { account: psp(input.currency), direction: "credit", amountMinor: input.refundMinor },
    ],
  };
}

export type ChargebackLostInput = {
  idempotencyKey: string;
  currency: string;
  amountMinor: number;
};

export function chargebackLostJournal(input: ChargebackLostInput): LedgerJournalDraft {
  assertPositive(input.amountMinor, "amountMinor");
  return {
    idempotencyKey: input.idempotencyKey,
    description: "Chargeback lost",
    lines: [
      {
        account: chargebackLosses(input.currency),
        direction: "debit",
        amountMinor: input.amountMinor,
      },
      { account: psp(input.currency), direction: "credit", amountMinor: input.amountMinor },
    ],
  };
}

/** True when every currency's debits equal its credits — the same invariant the DB trigger enforces,
 * checkable in pure domain tests before anything ever reaches Postgres. */
export function isBalanced(journal: LedgerJournalDraft): boolean {
  const byCurrency = new Map<string, number>();
  for (const line of journal.lines) {
    const signed = line.direction === "debit" ? line.amountMinor : -line.amountMinor;
    byCurrency.set(line.account.currency, (byCurrency.get(line.account.currency) ?? 0) + signed);
  }
  return [...byCurrency.values()].every((sum) => sum === 0);
}

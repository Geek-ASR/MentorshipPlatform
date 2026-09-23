import { and, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import type { LedgerAccountRef, LedgerJournalDraft } from "../domain/ledger";
import { ledgerAccounts, ledgerJournals, ledgerLines } from "./tables";

export type LedgerAccountRow = typeof ledgerAccounts.$inferSelect;
export type LedgerJournalRow = typeof ledgerJournals.$inferSelect;

async function getOrCreateAccount(executor: Executor, ref: LedgerAccountRef): Promise<string> {
  const where =
    ref.refId === null
      ? and(
          eq(ledgerAccounts.kind, ref.kind),
          isNull(ledgerAccounts.refId),
          eq(ledgerAccounts.currency, ref.currency),
        )
      : and(
          eq(ledgerAccounts.kind, ref.kind),
          eq(ledgerAccounts.refId, ref.refId),
          eq(ledgerAccounts.currency, ref.currency),
        );
  const [existing] = await executor
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(where)
    .limit(1);
  if (existing) return existing.id;

  const id = newId();
  const inserted = await executor
    .insert(ledgerAccounts)
    .values({ id, kind: ref.kind, refId: ref.refId, currency: ref.currency })
    .onConflictDoNothing()
    .returning({ id: ledgerAccounts.id });
  if (inserted[0]) return inserted[0].id;
  // Lost a race to create the same account; the winner's row is now visible.
  const [row] = await executor
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(where)
    .limit(1);
  return row!.id;
}

export type PostJournalResult =
  { posted: true; journalId: string } | { posted: false; reason: "duplicate" };

/**
 * Posts a journal idempotently: a repeat call with the same `idempotencyKey` is a no-op (docs/05
 * §4.3 `ledger_journals` UNIQUE(idempotency_key)), so callers never need their own dedupe check.
 * The DEFERRED balance trigger (docs/05 §4.3) fires at commit and rejects an unbalanced draft.
 *
 * Must be called with an `executor` that is already inside a `db.transaction()`. The balance
 * trigger is deferred to commit, not to the end of this function — outside a transaction, each
 * insert below is its own auto-committed statement, so the journal header would commit before its
 * lines exist, permanently consuming the idempotency key on a partial, lineless journal.
 */
export async function postJournal(
  executor: Executor,
  draft: LedgerJournalDraft,
): Promise<PostJournalResult> {
  const inserted = await executor
    .insert(ledgerJournals)
    .values({ id: newId(), idempotencyKey: draft.idempotencyKey, description: draft.description })
    .onConflictDoNothing({ target: ledgerJournals.idempotencyKey })
    .returning({ id: ledgerJournals.id });
  if (!inserted[0]) return { posted: false, reason: "duplicate" };

  const journalId = inserted[0].id;
  for (const line of draft.lines) {
    const accountId = await getOrCreateAccount(executor, line.account);
    await executor.insert(ledgerLines).values({
      id: newId(),
      journalId,
      accountId,
      direction: line.direction,
      amountMinor: line.amountMinor,
      currency: line.account.currency,
    });
  }
  return { posted: true, journalId };
}

/** Current balance of an account (sum of debits minus credits), for reconciliation invariant checks. */
export async function accountBalance(executor: Executor, ref: LedgerAccountRef): Promise<number> {
  const where =
    ref.refId === null
      ? and(
          eq(ledgerAccounts.kind, ref.kind),
          isNull(ledgerAccounts.refId),
          eq(ledgerAccounts.currency, ref.currency),
        )
      : and(
          eq(ledgerAccounts.kind, ref.kind),
          eq(ledgerAccounts.refId, ref.refId),
          eq(ledgerAccounts.currency, ref.currency),
        );
  const rows = await executor.execute<{ balance: number }>(sql`
    SELECT coalesce(sum(CASE WHEN app.ledger_lines.direction = 'debit' THEN app.ledger_lines.amount_minor ELSE -app.ledger_lines.amount_minor END), 0)::bigint AS balance
    FROM app.ledger_lines
    JOIN app.ledger_accounts ON app.ledger_accounts.id = app.ledger_lines.account_id
    WHERE ${where}
  `);
  return Number(rows[0]?.balance ?? 0);
}

-- Hand-written: ledger balance + immutability (docs/05 §4.3, ADR-013). drizzle-kit does not manage
-- functions/triggers. `app.raise_immutable()` already exists (0002_platform_triggers.sql).

CREATE OR REPLACE FUNCTION app.assert_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unbalanced record;
BEGIN
  -- Deferred to commit, so every line of a multi-INSERT journal has landed before this runs.
  SELECT currency, sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) AS diff
  INTO unbalanced
  FROM app.ledger_lines
  WHERE journal_id = NEW.journal_id
  GROUP BY currency
  HAVING sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) <> 0
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ledger journal % is not balanced for currency % (diff %)',
      NEW.journal_id, unbalanced.currency, unbalanced.diff
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_journal_balanced
  AFTER INSERT ON app.ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.assert_journal_balanced();
--> statement-breakpoint
CREATE TRIGGER ledger_lines_no_update_delete BEFORE UPDATE OR DELETE ON app.ledger_lines
  FOR EACH ROW EXECUTE FUNCTION app.raise_immutable();
--> statement-breakpoint
CREATE TRIGGER ledger_lines_no_truncate BEFORE TRUNCATE ON app.ledger_lines
  FOR EACH STATEMENT EXECUTE FUNCTION app.raise_immutable();
--> statement-breakpoint
CREATE TRIGGER ledger_journals_no_update_delete BEFORE UPDATE OR DELETE ON app.ledger_journals
  FOR EACH ROW EXECUTE FUNCTION app.raise_immutable();
--> statement-breakpoint
CREATE TRIGGER ledger_journals_no_truncate BEFORE TRUNCATE ON app.ledger_journals
  FOR EACH STATEMENT EXECUTE FUNCTION app.raise_immutable();

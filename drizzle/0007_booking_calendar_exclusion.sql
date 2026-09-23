-- Hand-written: drizzle-kit has no first-class EXCLUDE constraint support (docs/05 §4.1, ADR-027).
-- This is the guarantee that makes double-booking impossible at the database layer, independent of
-- application logic or isolation level (checked via the gist index at insert time).

ALTER TABLE "app"."calendar_blocks"
  ADD CONSTRAINT "calendar_blocks_during_valid"
  CHECK (
    NOT isempty(during)
    AND lower_inc(during)
    AND NOT upper_inc(during)
    AND upper(during) - lower(during) <= interval '12 hours'
  );
--> statement-breakpoint
ALTER TABLE "app"."calendar_blocks"
  ADD CONSTRAINT "calendar_blocks_no_overlap"
  EXCLUDE USING gist (mentor_id WITH =, during WITH &&) WHERE (active);
--> statement-breakpoint
ALTER TABLE "app"."sessions"
  ADD CONSTRAINT "sessions_during_valid"
  CHECK (
    NOT isempty(during)
    AND lower_inc(during)
    AND NOT upper_inc(during)
  );

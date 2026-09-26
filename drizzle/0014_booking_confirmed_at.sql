-- bookings.confirmed_at: when a booking first became `confirmed`. The paid-booking sync uses it to
-- tell a hold that was cancelled/expired before its payment landed (a late capture, refund in full)
-- apart from a confirmed booking that was cancelled normally (already refunded per the cancellation
-- policy, never touched again). Generated column/constraint statements plus a hand-written backfill.
ALTER TABLE "app"."bookings" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
-- Every confirmation path writes an audit row: `booking.confirmed` (free 1:1 insert or payment
-- capture) or `session.seat_registered` (free group/event seat).
UPDATE "app"."bookings" b
SET "confirmed_at" = a.first_confirmed_at
FROM (
  SELECT target_id, min(occurred_at) AS first_confirmed_at
  FROM "app"."audit_logs"
  WHERE target_type = 'booking' AND action IN ('booking.confirmed', 'session.seat_registered')
  GROUP BY target_id
) a
WHERE b.id::text = a.target_id;--> statement-breakpoint
-- Belt and braces for any row without an audit entry: these statuses are only reachable through
-- `confirmed`, and a booking confirms within its hold window, so created_at is a close lower bound.
UPDATE "app"."bookings"
SET "confirmed_at" = "created_at"
WHERE "confirmed_at" IS NULL
  AND "status" IN ('confirmed', 'cancelled_by_mentor', 'cancelled_by_admin', 'awaiting_outcome',
    'completed', 'no_show_mentor', 'no_show_student', 'disputed', 'resolved_refunded');--> statement-breakpoint
ALTER TABLE "app"."bookings" ADD CONSTRAINT "bookings_confirmed_at_consistency" CHECK ("app"."bookings"."status" <> 'confirmed' OR "app"."bookings"."confirmed_at" IS NOT NULL);

CREATE TABLE "app"."user_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_not_self" CHECK ("app"."user_blocks"."blocker_id" <> "app"."user_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "app"."user_restrictions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"until" timestamp with time zone,
	"reason_code" text NOT NULL,
	"source_action_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	CONSTRAINT "user_restrictions_capability_valid" CHECK (capability IN ('booking.create', 'booking.accept', 'message.send', 'review.create', 'event.host', 'listing.visible', 'payout.release', 'report.create'))
);
--> statement-breakpoint
ALTER TABLE "app"."user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_restrictions" ADD CONSTRAINT "user_restrictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_blocks_pair_unique" ON "app"."user_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "app"."user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "user_restrictions_active_idx" ON "app"."user_restrictions" USING btree ("user_id","capability") WHERE lifted_at IS NULL;
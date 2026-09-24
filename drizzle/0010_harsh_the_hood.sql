CREATE TABLE "app"."event_details" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description_md" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"recording_url" text,
	"recording_visibility" text,
	"recording_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_details_slug_unique" UNIQUE("slug"),
	CONSTRAINT "event_details_visibility_valid" CHECK (visibility IN ('public', 'unlisted', 'private')),
	CONSTRAINT "event_details_recording_visibility_valid" CHECK ("app"."event_details"."recording_visibility" IS NULL OR recording_visibility IN ('attendees', 'public'))
);
--> statement-breakpoint
CREATE TABLE "app"."event_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"used_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "app"."waitlist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"offer_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_status_valid" CHECK (status IN ('waiting', 'offered', 'claimed', 'expired', 'declined', 'left'))
);
--> statement-breakpoint
ALTER TABLE "app"."event_details" ADD CONSTRAINT "event_details_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_invites" ADD CONSTRAINT "event_invites_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_invites" ADD CONSTRAINT "event_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_invites" ADD CONSTRAINT "event_invites_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."waitlist_entries" ADD CONSTRAINT "waitlist_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."waitlist_entries" ADD CONSTRAINT "waitlist_entries_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_invites_session_idx" ON "app"."event_invites" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_one_active_per_student" ON "app"."waitlist_entries" USING btree ("session_id","student_id") WHERE status IN ('waiting','offered');--> statement-breakpoint
CREATE INDEX "waitlist_entries_fifo_idx" ON "app"."waitlist_entries" USING btree ("session_id","status","joined_at");
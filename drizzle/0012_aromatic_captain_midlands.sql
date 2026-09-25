CREATE TABLE "app"."appeals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"moderation_action_id" uuid NOT NULL,
	"appellant_user_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reviewer_id" uuid,
	"single_staff_review" boolean DEFAULT false NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appeals_status_valid" CHECK (status IN ('open', 'upheld', 'modified', 'overturned'))
);
--> statement-breakpoint
CREATE TABLE "app"."dispute_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dispute_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_evidence_kind_valid" CHECK (kind IN ('screenshot', 'message_ref', 'claim', 'signal_ref', 'note'))
);
--> statement-breakpoint
CREATE TABLE "app"."disputes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_deadline_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"refund_pct" integer,
	"at_fault_user_id" uuid,
	"decided_by" uuid,
	"appeal_deadline_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_booking_unique" UNIQUE("booking_id"),
	CONSTRAINT "disputes_status_valid" CHECK (status IN ('open', 'awaiting_evidence', 'under_review', 'resolved', 'appealed', 'closed')),
	CONSTRAINT "disputes_resolution_valid" CHECK ("app"."disputes"."resolution" IS NULL OR resolution IN ('full_refund', 'partial_refund', 'no_refund')),
	CONSTRAINT "disputes_refund_pct_range" CHECK ("app"."disputes"."refund_pct" IS NULL OR "app"."disputes"."refund_pct" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "app"."moderation_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"restriction_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"reason_code" text NOT NULL,
	"rationale" text,
	"case_id" uuid,
	"decided_by" uuid,
	"second_reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_action_valid" CHECK (action IN ('warn', 'restrict', 'suspend', 'ban', 'reinstate', 'remove_content', 'hide_profile'))
);
--> statement-breakpoint
CREATE TABLE "app"."moderation_case_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."moderation_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"proposed_by_rule_id" uuid,
	"assigned_to" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_cases_status_valid" CHECK (status IN ('open', 'assigned', 'action_proposed', 'decided', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "app"."platform_rating_stats" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"mean_rating" numeric(3, 2) DEFAULT '4.5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."policy_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_key" text NOT NULL,
	"subject_role" text NOT NULL,
	"rule_body" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_rules_rule_key_unique" UNIQUE("rule_key"),
	CONSTRAINT "policy_rules_subject_role_valid" CHECK (subject_role IN ('mentor', 'student', 'any'))
);
--> statement-breakpoint
CREATE TABLE "app"."reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"details" text,
	"case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_target_type_valid" CHECK (target_type IN ('user', 'mentor_profile', 'message', 'review', 'review_response', 'event', 'session', 'guide')),
	CONSTRAINT "reports_reason_code_valid" CHECK (reason_code IN ('harassment', 'hate', 'sexual_content', 'minor_safety', 'scam_fraud', 'off_platform_payment', 'impersonation', 'fake_credentials', 'spam', 'misinformation_harmful', 'intellectual_property', 'privacy_violation', 'other'))
);
--> statement-breakpoint
CREATE TABLE "app"."review_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"held_reason" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_responses_one_per_review" UNIQUE("review_id"),
	CONSTRAINT "review_responses_status_valid" CHECK (status IN ('pending', 'published', 'held', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "app"."reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"held_reason" text,
	"edit_window_expires_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_one_per_booking" UNIQUE("booking_id"),
	CONSTRAINT "reviews_status_valid" CHECK (status IN ('pending', 'published', 'held', 'removed')),
	CONSTRAINT "reviews_rating_range" CHECK ("app"."reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_not_self" CHECK ("app"."reviews"."author_user_id" <> "app"."reviews"."mentor_user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."trust_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"excused" boolean DEFAULT false NOT NULL,
	"excuse_reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"source_type" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_events_type_valid" CHECK (type IN ('mentor_no_show', 'mentor_late_cancel_24h', 'mentor_late_cancel_2h', 'mentor_cancel_24_72h', 'mentor_late_arrival_reported', 'student_no_show', 'free_event_no_show', 'hold_abuse', 'off_platform_solicitation_first', 'off_platform_solicitation_repeat', 'report_upheld_minor', 'report_upheld_major', 'chargeback_lost_friendly_fraud', 'review_manipulation', 'verification_fraud')),
	CONSTRAINT "trust_events_points_non_negative" CHECK ("app"."trust_events"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."trust_ingestion_watermark" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_audit_log_id" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."appeals" ADD CONSTRAINT "appeals_moderation_action_id_moderation_actions_id_fk" FOREIGN KEY ("moderation_action_id") REFERENCES "app"."moderation_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appeals" ADD CONSTRAINT "appeals_appellant_user_id_users_id_fk" FOREIGN KEY ("appellant_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "app"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."dispute_evidence" ADD CONSTRAINT "dispute_evidence_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."disputes" ADD CONSTRAINT "disputes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "app"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."disputes" ADD CONSTRAINT "disputes_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."moderation_actions" ADD CONSTRAINT "moderation_actions_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."moderation_case_events" ADD CONSTRAINT "moderation_case_events_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."review_responses" ADD CONSTRAINT "review_responses_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "app"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."review_responses" ADD CONSTRAINT "review_responses_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "app"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trust_events" ADD CONSTRAINT "trust_events_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_one_per_action" ON "app"."appeals" USING btree ("moderation_action_id");--> statement-breakpoint
CREATE INDEX "dispute_evidence_dispute_idx" ON "app"."dispute_evidence" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "app"."disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_actions_subject_idx" ON "app"."moderation_actions" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_case_events_case_idx" ON "app"."moderation_case_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_cases_target_idx" ON "app"."moderation_cases" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "moderation_cases_status_idx" ON "app"."moderation_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "policy_rules_subject_idx" ON "app"."policy_rules" USING btree ("subject_role","enabled");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "app"."reports" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter_target_idx" ON "app"."reports" USING btree ("reporter_user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "reviews_mentor_idx" ON "app"."reviews" USING btree ("mentor_user_id","status");--> statement-breakpoint
CREATE INDEX "trust_events_subject_idx" ON "app"."trust_events" USING btree ("subject_user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trust_events_source_unique" ON "app"."trust_events" USING btree ("source_type","source_id","type");
CREATE TABLE "app"."attendance_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"claimant_user_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_claims_outcome_valid" CHECK (outcome IN ('held', 'mentor_absent', 'student_absent', 'technical_issue'))
);
--> statement-breakpoint
CREATE TABLE "app"."attendance_signals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_signals_kind_valid" CHECK (kind IN ('join_click', 'check_in'))
);
--> statement-breakpoint
CREATE TABLE "app"."availability_exceptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"during" "tstzrange" NOT NULL,
	"local_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_kind_valid" CHECK (kind IN ('unavailable', 'extra_available'))
);
--> statement-breakpoint
CREATE TABLE "app"."availability_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_local" text NOT NULL,
	"end_local" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_weekday_valid" CHECK ("app"."availability_rules"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "availability_rules_local_time_format" CHECK ("app"."availability_rules"."start_local" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "app"."availability_rules"."end_local" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "availability_rules_time_order" CHECK ("app"."availability_rules"."start_local" < "app"."availability_rules"."end_local")
);
--> statement-breakpoint
CREATE TABLE "app"."bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"price_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"intake_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_status_valid" CHECK (status IN ('held', 'confirmed', 'expired', 'cancelled_by_student', 'cancelled_by_mentor', 'cancelled_by_admin', 'cancelled_system', 'awaiting_outcome', 'completed', 'no_show_mentor', 'no_show_student', 'disputed', 'resolved_refunded', 'payment_orphaned')),
	CONSTRAINT "bookings_price_non_negative" CHECK ("app"."bookings"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."calendar_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"during" "tstzrange" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_blocks_source_type_valid" CHECK (source_type IN ('session', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"kind" text DEFAULT 'one_on_one' NOT NULL,
	"title" text NOT NULL,
	"description_md" text,
	"allowed_durations_min" integer[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"intake_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_services_kind_valid" CHECK (kind IN ('one_on_one', 'group', 'event'))
);
--> statement-breakpoint
CREATE TABLE "app"."reschedule_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"proposed_during" "tstzrange" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "reschedule_requests_status_valid" CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
	CONSTRAINT "reschedule_requests_requested_by_valid" CHECK (requested_by IN ('student', 'mentor'))
);
--> statement-breakpoint
CREATE TABLE "app"."scheduling_settings" (
	"mentor_user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text NOT NULL,
	"slot_step_min" integer DEFAULT 30 NOT NULL,
	"buffer_after_min" integer DEFAULT 15 NOT NULL,
	"min_notice_min" integer DEFAULT 720 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"max_sessions_per_day" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_settings_slot_step_valid" CHECK ("app"."scheduling_settings"."slot_step_min" IN (15, 30, 60)),
	CONSTRAINT "scheduling_settings_buffer_valid" CHECK ("app"."scheduling_settings"."buffer_after_min" BETWEEN 0 AND 60),
	CONSTRAINT "scheduling_settings_min_notice_valid" CHECK ("app"."scheduling_settings"."min_notice_min" BETWEEN 60 AND 10080),
	CONSTRAINT "scheduling_settings_max_advance_valid" CHECK ("app"."scheduling_settings"."max_advance_days" BETWEEN 7 AND 90),
	CONSTRAINT "scheduling_settings_max_sessions_valid" CHECK ("app"."scheduling_settings"."max_sessions_per_day" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "app"."service_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"duration_min" integer NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	CONSTRAINT "service_prices_price_non_negative" CHECK ("app"."service_prices"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"host_user_id" uuid NOT NULL,
	"service_id" uuid,
	"during" "tstzrange" NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"min_participants" integer DEFAULT 1 NOT NULL,
	"seat_price_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"registration_closes_at" timestamp with time zone,
	"min_participants_check_at" timestamp with time zone,
	"meeting_provider" text,
	"meeting_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_kind_valid" CHECK (kind IN ('one_on_one', 'group', 'event')),
	CONSTRAINT "sessions_status_valid" CHECK (status IN ('scheduled', 'cancelled', 'completed', 'under_review')),
	CONSTRAINT "sessions_seat_price_non_negative" CHECK ("app"."sessions"."seat_price_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."attendance_claims" ADD CONSTRAINT "attendance_claims_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "app"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attendance_claims" ADD CONSTRAINT "attendance_claims_claimant_user_id_users_id_fk" FOREIGN KEY ("claimant_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attendance_signals" ADD CONSTRAINT "attendance_signals_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attendance_signals" ADD CONSTRAINT "attendance_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."availability_exceptions" ADD CONSTRAINT "availability_exceptions_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."availability_rules" ADD CONSTRAINT "availability_rules_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bookings" ADD CONSTRAINT "bookings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bookings" ADD CONSTRAINT "bookings_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."calendar_blocks" ADD CONSTRAINT "calendar_blocks_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_services" ADD CONSTRAINT "mentor_services_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reschedule_requests" ADD CONSTRAINT "reschedule_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "app"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."scheduling_settings" ADD CONSTRAINT "scheduling_settings_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_prices" ADD CONSTRAINT "service_prices_service_id_mentor_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "app"."mentor_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_host_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_service_id_mentor_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "app"."mentor_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_claims_one_per_party" ON "app"."attendance_claims" USING btree ("booking_id","claimant_user_id");--> statement-breakpoint
CREATE INDEX "attendance_signals_session_idx" ON "app"."attendance_signals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "availability_exceptions_mentor_idx" ON "app"."availability_exceptions" USING btree ("mentor_user_id");--> statement-breakpoint
CREATE INDEX "availability_rules_mentor_idx" ON "app"."availability_rules" USING btree ("mentor_user_id");--> statement-breakpoint
CREATE INDEX "bookings_session_idx" ON "app"."bookings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "bookings_student_idx" ON "app"."bookings" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_active_seat" ON "app"."bookings" USING btree ("session_id","student_id") WHERE status IN ('held','confirmed','completed','no_show_student','no_show_mentor','disputed');--> statement-breakpoint
CREATE INDEX "calendar_blocks_mentor_idx" ON "app"."calendar_blocks" USING btree ("mentor_id");--> statement-breakpoint
CREATE INDEX "calendar_blocks_source_idx" ON "app"."calendar_blocks" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "mentor_services_mentor_idx" ON "app"."mentor_services" USING btree ("mentor_user_id");--> statement-breakpoint
CREATE INDEX "reschedule_requests_booking_idx" ON "app"."reschedule_requests" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_prices_service_duration_unique" ON "app"."service_prices" USING btree ("service_id","duration_min");--> statement-breakpoint
CREATE INDEX "sessions_host_idx" ON "app"."sessions" USING btree ("host_user_id");
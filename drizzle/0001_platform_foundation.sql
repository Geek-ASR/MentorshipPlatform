CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SEQUENCE "app"."audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "app"."audit_logs" (
	"id" bigint PRIMARY KEY DEFAULT nextval('app.audit_logs_id_seq') NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"request_id" text,
	"ip_prefix" "inet",
	"user_agent_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text,
	"row_hash" text DEFAULT '' NOT NULL,
	CONSTRAINT "audit_logs_actor_type_valid" CHECK (actor_type IN ('user', 'staff', 'system', 'provider')),
	CONSTRAINT "audit_logs_action_format" CHECK ("app"."audit_logs"."action" ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$')
);
--> statement-breakpoint
CREATE TABLE "app"."feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."idempotency_keys" (
	"actor_key" text NOT NULL,
	"route" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_actor_key_route_key_pk" PRIMARY KEY("actor_key","route","key"),
	CONSTRAINT "idempotency_keys_key_length" CHECK (length("app"."idempotency_keys"."key") BETWEEN 16 AND 128),
	CONSTRAINT "idempotency_keys_state_valid" CHECK (state IN ('in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "app"."outbox_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"dedupe_key" text,
	"causation_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "outbox_jobs_status_valid" CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "outbox_jobs_attempts_valid" CHECK ("app"."outbox_jobs"."attempts" >= 0 AND "app"."outbox_jobs"."max_attempts" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."platform_settings" (
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"value" jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_key_version_pk" PRIMARY KEY("key","version"),
	CONSTRAINT "platform_settings_version_positive" CHECK ("app"."platform_settings"."version" > 0),
	CONSTRAINT "platform_settings_reason_present" CHECK (length(trim("app"."platform_settings"."reason")) >= 3)
);
--> statement-breakpoint
CREATE TABLE "app"."rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "app"."countries" (
	"iso2" char(2) PRIMARY KEY NOT NULL,
	"iso3" char(3) NOT NULL,
	"numeric_code" char(3),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"default_currency" char(3),
	"study_abroad_enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "countries_iso3_unique" UNIQUE("iso3"),
	CONSTRAINT "countries_slug_unique" UNIQUE("slug"),
	CONSTRAINT "countries_iso2_format" CHECK ("app"."countries"."iso2" ~ '^[A-Z]{2}$'),
	CONSTRAINT "countries_iso3_format" CHECK ("app"."countries"."iso3" ~ '^[A-Z]{3}$'),
	CONSTRAINT "countries_slug_format" CHECK ("app"."countries"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "countries_status_valid" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "app"."currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"minor_unit" smallint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_format" CHECK ("app"."currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_minor_unit_range" CHECK ("app"."currencies"."minor_unit" BETWEEN 0 AND 4),
	CONSTRAINT "currencies_status_valid" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "app"."taxonomy_term_translations" (
	"term_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "taxonomy_term_translations_term_id_locale_pk" PRIMARY KEY("term_id","locale"),
	CONSTRAINT "taxonomy_term_translations_locale_format" CHECK ("app"."taxonomy_term_translations"."locale" ~ '^[a-z]{2}(-[A-Z]{2})?$')
);
--> statement-breakpoint
CREATE TABLE "app"."taxonomy_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vocabulary" text NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into_id" uuid,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_terms_vocabulary_slug_unique" UNIQUE("vocabulary","slug"),
	CONSTRAINT "taxonomy_terms_vocabulary_valid" CHECK (vocabulary IN ('category', 'skill', 'industry', 'language')),
	CONSTRAINT "taxonomy_terms_status_valid" CHECK (status IN ('active', 'deprecated', 'merged')),
	CONSTRAINT "taxonomy_terms_slug_format" CHECK ("app"."taxonomy_terms"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "taxonomy_terms_not_own_parent" CHECK ("app"."taxonomy_terms"."parent_id" IS NULL OR "app"."taxonomy_terms"."parent_id" <> "app"."taxonomy_terms"."id"),
	CONSTRAINT "taxonomy_terms_merged_consistency" CHECK ((status = 'merged') = ("app"."taxonomy_terms"."merged_into_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "app"."countries" ADD CONSTRAINT "countries_default_currency_currencies_code_fk" FOREIGN KEY ("default_currency") REFERENCES "app"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."taxonomy_term_translations" ADD CONSTRAINT "taxonomy_term_translations_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "app"."taxonomy_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."taxonomy_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_merged_into_fk" FOREIGN KEY ("merged_into_id") REFERENCES "app"."taxonomy_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "app"."audit_logs" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "app"."audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_brin" ON "app"."audit_logs" USING brin ("occurred_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "app"."idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_jobs_due_idx" ON "app"."outbox_jobs" USING btree ("run_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "outbox_jobs_stale_lock_idx" ON "app"."outbox_jobs" USING btree ("locked_until") WHERE status = 'processing';--> statement-breakpoint
CREATE INDEX "outbox_jobs_failed_idx" ON "app"."outbox_jobs" USING btree ("updated_at") WHERE status = 'failed';--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "app"."rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "taxonomy_terms_parent_idx" ON "app"."taxonomy_terms" USING btree ("parent_id");
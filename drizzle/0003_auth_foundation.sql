CREATE TABLE "app"."auth_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_accounts_provider_account_unique" UNIQUE("provider","provider_account_id"),
	CONSTRAINT "auth_accounts_user_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "auth_accounts_provider_valid" CHECK (provider IN ('credential', 'google'))
);
--> statement-breakpoint
CREATE TABLE "app"."auth_backup_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_backup_codes_user_hash_unique" UNIQUE("user_id","code_hash")
);
--> statement-breakpoint
CREATE TABLE "app"."auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"auth_time" timestamp with time zone NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_prefix" "inet",
	"user_agent_hash" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "app"."auth_two_factors" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"secret_tag" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_used_counter" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."auth_verification_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_verification_tokens_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_verification_tokens_purpose_valid" CHECK (purpose IN ('email_verify', 'password_reset', 'email_change', 'email_change_revert', 'mfa_pending'))
);
--> statement-breakpoint
CREATE TABLE "app"."user_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"ip_prefix" "inet",
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_consents_kind_valid" CHECK (kind IN ('terms', 'privacy'))
);
--> statement-breakpoint
CREATE TABLE "app"."user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_valid" CHECK (role IN ('student', 'mentor', 'event_host', 'content_editor', 'verification_reviewer', 'moderator', 'finance', 'admin', 'super_admin'))
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text,
	"country_iso2" char(2),
	"birth_year" smallint NOT NULL,
	"adult_attested_at" timestamp with time zone NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_status_valid" CHECK (status IN ('active', 'restricted', 'suspended', 'banned', 'deletion_requested', 'deleted')),
	CONSTRAINT "users_display_name_present" CHECK (length(trim("app"."users"."display_name")) >= 1),
	CONSTRAINT "users_birth_year_plausible" CHECK ("app"."users"."birth_year" BETWEEN 1900 AND 2100)
);
--> statement-breakpoint
ALTER TABLE "app"."auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_backup_codes" ADD CONSTRAINT "auth_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_two_factors" ADD CONSTRAINT "auth_two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_verification_tokens" ADD CONSTRAINT "auth_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "app"."auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_backup_codes_user_idx" ON "app"."auth_backup_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "app"."auth_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "app"."auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_verification_tokens_user_idx" ON "app"."auth_verification_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "auth_verification_tokens_expires_idx" ON "app"."auth_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_consents_user_idx" ON "app"."user_consents" USING btree ("user_id","kind");
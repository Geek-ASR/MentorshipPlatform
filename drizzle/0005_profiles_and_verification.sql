CREATE TABLE "app"."mentor_affiliations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"university_id" uuid,
	"company_id" uuid,
	"program_id" uuid,
	"title" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_affiliations_kind_valid" CHECK (kind IN ('education', 'work')),
	CONSTRAINT "mentor_affiliations_target_matches_kind" CHECK ((kind = 'education' AND "app"."mentor_affiliations"."university_id" IS NOT NULL AND "app"."mentor_affiliations"."company_id" IS NULL) OR (kind = 'work' AND "app"."mentor_affiliations"."company_id" IS NOT NULL AND "app"."mentor_affiliations"."university_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_eligibility_attestations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"country_iso2" char(2) NOT NULL,
	"residency_status" text NOT NULL,
	"payout_mode_result" text NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mentor_eligibility_residency_status_valid" CHECK (residency_status IN ('citizen_or_pr', 'work_authorised', 'student_visa', 'not_authorised', 'other')),
	CONSTRAINT "mentor_eligibility_payout_mode_valid" CHECK (payout_mode_result IN ('volunteer', 'paid'))
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_expertise" (
	"mentor_user_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	CONSTRAINT "mentor_expertise_mentor_user_id_term_id_pk" PRIMARY KEY("mentor_user_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_languages" (
	"mentor_user_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"proficiency" text DEFAULT 'fluent' NOT NULL,
	CONSTRAINT "mentor_languages_mentor_user_id_term_id_pk" PRIMARY KEY("mentor_user_id","term_id"),
	CONSTRAINT "mentor_languages_proficiency_valid" CHECK (proficiency IN ('native', 'fluent', 'conversational'))
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_links_kind_valid" CHECK (kind IN ('website', 'linkedin', 'github', 'twitter', 'portfolio', 'other')),
	CONSTRAINT "mentor_links_url_scheme" CHECK ("app"."mentor_links"."url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"headline" text,
	"bio_md" text,
	"application_status" text DEFAULT 'draft' NOT NULL,
	"payout_mode" text DEFAULT 'volunteer' NOT NULL,
	"is_listed" boolean DEFAULT false NOT NULL,
	"active_credential_count" integer DEFAULT 0 NOT NULL,
	"search_indexable" boolean DEFAULT true NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_profiles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "mentor_profiles_status_valid" CHECK (application_status IN ('draft', 'submitted', 'approved', 'rejected', 'paused')),
	CONSTRAINT "mentor_profiles_payout_mode_valid" CHECK (payout_mode IN ('volunteer', 'paid')),
	CONSTRAINT "mentor_profiles_slug_format" CHECK ("app"."mentor_profiles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_search_documents" (
	"mentor_user_id" uuid PRIMARY KEY NOT NULL,
	"is_listed" boolean DEFAULT false NOT NULL,
	"country_iso2" char(2),
	"university_ids" uuid[] DEFAULT '{}' NOT NULL,
	"company_ids" uuid[] DEFAULT '{}' NOT NULL,
	"category_ids" uuid[] DEFAULT '{}' NOT NULL,
	"language_ids" uuid[] DEFAULT '{}' NOT NULL,
	"tsv" "tsvector" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."mentor_stats" (
	"mentor_user_id" uuid PRIMARY KEY NOT NULL,
	"sessions_completed" integer DEFAULT 0 NOT NULL,
	"reliability_pct" integer DEFAULT 100 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"avg_rating" numeric(3, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."saved_mentors" (
	"student_user_id" uuid NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_mentors_student_user_id_mentor_user_id_pk" PRIMARY KEY("student_user_id","mentor_user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."student_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'logged_in' NOT NULL,
	"headline" text,
	"bio_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_profiles_visibility_valid" CHECK (visibility IN ('public', 'logged_in', 'booked_mentors_only'))
);
--> statement-breakpoint
CREATE TABLE "app"."credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"affiliation_id" uuid,
	"kind" text NOT NULL,
	"public_label" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_kind_valid" CHECK (kind IN ('university_email', 'work_email')),
	CONSTRAINT "credentials_status_valid" CHECK (status IN ('active', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "app"."verification_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"affiliation_id" uuid NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"challenged_email" text NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_requests_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "verification_requests_method_valid" CHECK (method IN ('university_email', 'work_email')),
	CONSTRAINT "verification_requests_status_valid" CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "app"."verified_email_fingerprints" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."mentor_affiliations" ADD CONSTRAINT "mentor_affiliations_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_affiliations" ADD CONSTRAINT "mentor_affiliations_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "app"."universities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_affiliations" ADD CONSTRAINT "mentor_affiliations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_affiliations" ADD CONSTRAINT "mentor_affiliations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "app"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_eligibility_attestations" ADD CONSTRAINT "mentor_eligibility_attestations_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_eligibility_attestations" ADD CONSTRAINT "mentor_eligibility_attestations_country_iso2_countries_iso2_fk" FOREIGN KEY ("country_iso2") REFERENCES "app"."countries"("iso2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_expertise" ADD CONSTRAINT "mentor_expertise_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_expertise" ADD CONSTRAINT "mentor_expertise_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "app"."taxonomy_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_languages" ADD CONSTRAINT "mentor_languages_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_languages" ADD CONSTRAINT "mentor_languages_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "app"."taxonomy_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_links" ADD CONSTRAINT "mentor_links_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_profiles" ADD CONSTRAINT "mentor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_search_documents" ADD CONSTRAINT "mentor_search_documents_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mentor_stats" ADD CONSTRAINT "mentor_stats_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."saved_mentors" ADD CONSTRAINT "saved_mentors_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."saved_mentors" ADD CONSTRAINT "saved_mentors_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."credentials" ADD CONSTRAINT "credentials_affiliation_id_mentor_affiliations_id_fk" FOREIGN KEY ("affiliation_id") REFERENCES "app"."mentor_affiliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."verification_requests" ADD CONSTRAINT "verification_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."verification_requests" ADD CONSTRAINT "verification_requests_affiliation_id_mentor_affiliations_id_fk" FOREIGN KEY ("affiliation_id") REFERENCES "app"."mentor_affiliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."verified_email_fingerprints" ADD CONSTRAINT "verified_email_fingerprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_affiliations_mentor_idx" ON "app"."mentor_affiliations" USING btree ("mentor_user_id");--> statement-breakpoint
CREATE INDEX "mentor_affiliations_university_idx" ON "app"."mentor_affiliations" USING btree ("university_id");--> statement-breakpoint
CREATE INDEX "mentor_affiliations_company_idx" ON "app"."mentor_affiliations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "mentor_eligibility_mentor_idx" ON "app"."mentor_eligibility_attestations" USING btree ("mentor_user_id","attested_at");--> statement-breakpoint
CREATE INDEX "mentor_expertise_term_idx" ON "app"."mentor_expertise" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "mentor_links_mentor_idx" ON "app"."mentor_links" USING btree ("mentor_user_id");--> statement-breakpoint
CREATE INDEX "mentor_profiles_listed_idx" ON "app"."mentor_profiles" USING btree ("is_listed");--> statement-breakpoint
CREATE INDEX "mentor_search_documents_tsv_idx" ON "app"."mentor_search_documents" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "mentor_search_documents_university_idx" ON "app"."mentor_search_documents" USING gin ("university_ids");--> statement-breakpoint
CREATE INDEX "mentor_search_documents_company_idx" ON "app"."mentor_search_documents" USING gin ("company_ids");--> statement-breakpoint
CREATE INDEX "mentor_search_documents_category_idx" ON "app"."mentor_search_documents" USING gin ("category_ids");--> statement-breakpoint
CREATE INDEX "mentor_search_documents_language_idx" ON "app"."mentor_search_documents" USING gin ("language_ids");--> statement-breakpoint
CREATE INDEX "mentor_search_documents_listed_idx" ON "app"."mentor_search_documents" USING btree ("is_listed");--> statement-breakpoint
CREATE INDEX "saved_mentors_mentor_idx" ON "app"."saved_mentors" USING btree ("mentor_user_id");--> statement-breakpoint
CREATE INDEX "credentials_user_idx" ON "app"."credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credentials_affiliation_idx" ON "app"."credentials" USING btree ("affiliation_id");--> statement-breakpoint
CREATE INDEX "verification_requests_user_idx" ON "app"."verification_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_requests_affiliation_idx" ON "app"."verification_requests" USING btree ("affiliation_id");
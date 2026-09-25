CREATE TABLE "app"."article_slug_redirects" (
	"old_slug" text PRIMARY KEY NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."articles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"dek" text,
	"body_md" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"category_term_id" uuid,
	"country_iso2" char(2),
	"university_id" uuid,
	"source_type" text DEFAULT 'editorial' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disclaimer_kind" text,
	"applies_to_intake" text,
	"last_verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"next_review_due_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "articles_slug_format" CHECK ("app"."articles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "articles_status_valid" CHECK (status IN ('draft', 'published', 'archived')),
	CONSTRAINT "articles_source_type_valid" CHECK (source_type IN ('official', 'mentor_experience', 'community', 'editorial')),
	CONSTRAINT "articles_disclaimer_kind_valid" CHECK (disclaimer_kind IN ('immigration', 'legal', 'financial', 'medical')),
	CONSTRAINT "articles_published_at_consistency" CHECK ("app"."articles"."status" = 'draft' OR "app"."articles"."published_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."article_slug_redirects" ADD CONSTRAINT "article_slug_redirects_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_category_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("category_term_id") REFERENCES "app"."taxonomy_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_country_iso2_countries_iso2_fk" FOREIGN KEY ("country_iso2") REFERENCES "app"."countries"("iso2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "app"."universities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "app"."articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "articles_country_idx" ON "app"."articles" USING btree ("country_iso2");--> statement-breakpoint
CREATE INDEX "articles_university_idx" ON "app"."articles" USING btree ("university_id");--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "app"."articles" USING btree ("category_term_id");--> statement-breakpoint
CREATE INDEX "articles_review_due_idx" ON "app"."articles" USING btree ("next_review_due_at");
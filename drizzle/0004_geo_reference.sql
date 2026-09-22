CREATE TABLE "app"."cities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"country_iso2" char(2) NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"geoname_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_country_slug_unique" UNIQUE("country_iso2","slug"),
	CONSTRAINT "cities_slug_format" CHECK ("app"."cities"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "cities_status_valid" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "app"."companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "companies_slug_format" CHECK ("app"."companies"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "companies_status_valid" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "app"."company_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_domains_domain_unique" UNIQUE("domain"),
	CONSTRAINT "company_domains_status_valid" CHECK (status IN ('active', 'inactive')),
	CONSTRAINT "company_domains_format" CHECK ("app"."company_domains"."domain" ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);
--> statement-breakpoint
CREATE TABLE "app"."departments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"university_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_university_slug_unique" UNIQUE("university_id","slug")
);
--> statement-breakpoint
CREATE TABLE "app"."programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"university_id" uuid NOT NULL,
	"department_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"degree_level" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"discontinued_on" date,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_university_slug_unique" UNIQUE("university_id","slug"),
	CONSTRAINT "programs_degree_level_valid" CHECK (degree_level IN ('bachelor', 'master', 'phd', 'diploma', 'other')),
	CONSTRAINT "programs_status_valid" CHECK (status IN ('active', 'discontinued'))
);
--> statement-breakpoint
CREATE TABLE "app"."universities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ror_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country_iso2" char(2) NOT NULL,
	"city_id" uuid,
	"website" text,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "universities_ror_id_unique" UNIQUE("ror_id"),
	CONSTRAINT "universities_country_slug_unique" UNIQUE("country_iso2","slug"),
	CONSTRAINT "universities_slug_format" CHECK ("app"."universities"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "universities_status_valid" CHECK (status IN ('active', 'merged', 'closed')),
	CONSTRAINT "universities_merged_consistency" CHECK ((status = 'merged') = ("app"."universities"."merged_into_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "app"."university_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"university_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "university_aliases_unique" UNIQUE("university_id","alias")
);
--> statement-breakpoint
CREATE TABLE "app"."university_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"university_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"kind" text DEFAULT 'current' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "university_domains_domain_unique" UNIQUE("domain"),
	CONSTRAINT "university_domains_kind_valid" CHECK (kind IN ('current', 'alumni')),
	CONSTRAINT "university_domains_status_valid" CHECK (status IN ('active', 'inactive')),
	CONSTRAINT "university_domains_format" CHECK ("app"."university_domains"."domain" ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);
--> statement-breakpoint
ALTER TABLE "app"."cities" ADD CONSTRAINT "cities_country_iso2_countries_iso2_fk" FOREIGN KEY ("country_iso2") REFERENCES "app"."countries"("iso2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."company_domains" ADD CONSTRAINT "company_domains_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."departments" ADD CONSTRAINT "departments_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "app"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."programs" ADD CONSTRAINT "programs_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "app"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."programs" ADD CONSTRAINT "programs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "app"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."universities" ADD CONSTRAINT "universities_country_iso2_countries_iso2_fk" FOREIGN KEY ("country_iso2") REFERENCES "app"."countries"("iso2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."universities" ADD CONSTRAINT "universities_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "app"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."universities" ADD CONSTRAINT "universities_merged_into_fk" FOREIGN KEY ("merged_into_id") REFERENCES "app"."universities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."university_aliases" ADD CONSTRAINT "university_aliases_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "app"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."university_domains" ADD CONSTRAINT "university_domains_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "app"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_country_idx" ON "app"."cities" USING btree ("country_iso2");--> statement-breakpoint
CREATE INDEX "company_domains_company_idx" ON "app"."company_domains" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "universities_country_idx" ON "app"."universities" USING btree ("country_iso2");--> statement-breakpoint
CREATE INDEX "university_domains_university_idx" ON "app"."university_domains" USING btree ("university_id");
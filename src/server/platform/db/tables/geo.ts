import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { checkIn } from "../sql-helpers";
import { appSchema } from "./platform";
import { countries, type ReferenceStatus } from "./reference";

/* Geography and institutions (docs/05 §3.2, §8). Universities come from ROR + admin curation, never
 * scraped or auto-trusted (docs/10 §2.2) — this seed is a hand-curated starting set, not a bulk import. */

const REFERENCE_STATUSES = ["active", "inactive"] as const;

export const cities = appSchema.table(
  "cities",
  {
    id: uuid("id").primaryKey(),
    countryIso2: char("country_iso2", { length: 2 })
      .notNull()
      .references(() => countries.iso2),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    geonameId: integer("geoname_id"),
    status: text("status").$type<ReferenceStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("cities_country_slug_unique").on(t.countryIso2, t.slug),
    check("cities_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("cities_status_valid", checkIn("status", REFERENCE_STATUSES)),
    index("cities_country_idx").on(t.countryIso2),
  ],
);

export const UNIVERSITY_STATUSES = ["active", "merged", "closed"] as const;
export type UniversityStatus = (typeof UNIVERSITY_STATUSES)[number];

export const universities = appSchema.table(
  "universities",
  {
    id: uuid("id").primaryKey(),
    /** External stable id from the Research Organization Registry, when known. */
    rorId: text("ror_id").unique("universities_ror_id_unique"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    countryIso2: char("country_iso2", { length: 2 })
      .notNull()
      .references(() => countries.iso2),
    cityId: uuid("city_id").references(() => cities.id),
    website: text("website"),
    status: text("status").$type<UniversityStatus>().notNull().default("active"),
    mergedIntoId: uuid("merged_into_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("universities_country_slug_unique").on(t.countryIso2, t.slug),
    foreignKey({
      name: "universities_merged_into_fk",
      columns: [t.mergedIntoId],
      foreignColumns: [t.id],
    }),
    check("universities_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("universities_status_valid", checkIn("status", UNIVERSITY_STATUSES)),
    check(
      "universities_merged_consistency",
      sql`(status = 'merged') = (${t.mergedIntoId} IS NOT NULL)`,
    ),
    index("universities_country_idx").on(t.countryIso2),
  ],
);

export const universityAliases = appSchema.table(
  "university_aliases",
  {
    id: uuid("id").primaryKey(),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("university_aliases_unique").on(t.universityId, t.alias)],
);

export const UNIVERSITY_DOMAIN_KINDS = ["current", "alumni"] as const;
export type UniversityDomainKind = (typeof UNIVERSITY_DOMAIN_KINDS)[number];

/** Email domains mapped to a university, for the verification email-challenge (docs/10 §2.2). */
export const universityDomains = appSchema.table(
  "university_domains",
  {
    id: uuid("id").primaryKey(),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    /** Lowercase registrable domain or subdomain, e.g. `tum.de`, `alumni.tum.de`. */
    domain: text("domain").notNull().unique("university_domains_domain_unique"),
    kind: text("kind").$type<UniversityDomainKind>().notNull().default("current"),
    status: text("status").$type<ReferenceStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("university_domains_kind_valid", checkIn("kind", UNIVERSITY_DOMAIN_KINDS)),
    check("university_domains_status_valid", checkIn("status", REFERENCE_STATUSES)),
    check("university_domains_format", sql`${t.domain} ~ '^[a-z0-9.-]+\\.[a-z]{2,}$'`),
    index("university_domains_university_idx").on(t.universityId),
  ],
);

export const DEGREE_LEVELS = ["bachelor", "master", "phd", "diploma", "other"] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const departments = appSchema.table(
  "departments",
  {
    id: uuid("id").primaryKey(),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("departments_university_slug_unique").on(t.universityId, t.slug)],
);

export const PROGRAM_STATUSES = ["active", "discontinued"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const programs = appSchema.table(
  "programs",
  {
    id: uuid("id").primaryKey(),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => departments.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    degreeLevel: text("degree_level").$type<DegreeLevel>().notNull(),
    status: text("status").$type<ProgramStatus>().notNull().default("active"),
    discontinuedOn: date("discontinued_on"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("programs_university_slug_unique").on(t.universityId, t.slug),
    check("programs_degree_level_valid", checkIn("degree_level", DEGREE_LEVELS)),
    check("programs_status_valid", checkIn("status", PROGRAM_STATUSES)),
  ],
);

export const companies = appSchema.table(
  "companies",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique("companies_slug_unique"),
    website: text("website"),
    status: text("status").$type<ReferenceStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("companies_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("companies_status_valid", checkIn("status", REFERENCE_STATUSES)),
  ],
);

export const companyDomains = appSchema.table(
  "company_domains",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    domain: text("domain").notNull().unique("company_domains_domain_unique"),
    status: text("status").$type<ReferenceStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("company_domains_status_valid", checkIn("status", REFERENCE_STATUSES)),
    check("company_domains_format", sql`${t.domain} ~ '^[a-z0-9.-]+\\.[a-z]{2,}$'`),
    index("company_domains_company_idx").on(t.companyId),
  ],
);

import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { checkIn } from "../sql-helpers";
import { appSchema } from "./platform";

/* Reference data is data, not code: admins add countries, currencies and taxonomy terms (docs/05 §8). */

const REFERENCE_STATUSES = ["active", "inactive"] as const;
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];

export const currencies = appSchema.table(
  "currencies",
  {
    code: char("code", { length: 3 }).primaryKey(),
    name: text("name").notNull(),
    minorUnit: smallint("minor_unit").notNull(),
    status: text("status").$type<ReferenceStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("currencies_code_format", sql`${t.code} ~ '^[A-Z]{3}$'`),
    check("currencies_minor_unit_range", sql`${t.minorUnit} BETWEEN 0 AND 4`),
    check("currencies_status_valid", checkIn("status", REFERENCE_STATUSES)),
  ],
);

export const countries = appSchema.table(
  "countries",
  {
    iso2: char("iso2", { length: 2 }).primaryKey(),
    iso3: char("iso3", { length: 3 }).notNull().unique("countries_iso3_unique"),
    numericCode: char("numeric_code", { length: 3 }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique("countries_slug_unique"),
    defaultCurrency: char("default_currency", { length: 3 }).references(() => currencies.code),
    studyAbroadEnabled: boolean("study_abroad_enabled").notNull().default(false),
    status: text("status").$type<ReferenceStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("countries_iso2_format", sql`${t.iso2} ~ '^[A-Z]{2}$'`),
    check("countries_iso3_format", sql`${t.iso3} ~ '^[A-Z]{3}$'`),
    check("countries_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("countries_status_valid", checkIn("status", REFERENCE_STATUSES)),
  ],
);

export const TAXONOMY_VOCABULARIES = ["category", "skill", "industry", "language"] as const;
export type TaxonomyVocabulary = (typeof TAXONOMY_VOCABULARIES)[number];

export const TAXONOMY_STATUSES = ["active", "deprecated", "merged"] as const;
export type TaxonomyStatus = (typeof TAXONOMY_STATUSES)[number];

/** Flags consumed by rules, e.g. `{ "sensitiveTopic": "immigration" }` triggers disclaimers (docs/12 §14). */
export type TaxonomyFlags = {
  sensitiveTopic?: "immigration" | "legal" | "financial" | "medical";
};

export const taxonomyTerms = appSchema.table(
  "taxonomy_terms",
  {
    id: uuid("id").primaryKey(),
    vocabulary: text("vocabulary").$type<TaxonomyVocabulary>().notNull(),
    parentId: uuid("parent_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").$type<TaxonomyStatus>().notNull().default("active"),
    mergedIntoId: uuid("merged_into_id"),
    flags: jsonb("flags").$type<TaxonomyFlags>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("taxonomy_terms_vocabulary_slug_unique").on(t.vocabulary, t.slug),
    foreignKey({ name: "taxonomy_terms_parent_fk", columns: [t.parentId], foreignColumns: [t.id] }),
    foreignKey({
      name: "taxonomy_terms_merged_into_fk",
      columns: [t.mergedIntoId],
      foreignColumns: [t.id],
    }),
    check("taxonomy_terms_vocabulary_valid", checkIn("vocabulary", TAXONOMY_VOCABULARIES)),
    check("taxonomy_terms_status_valid", checkIn("status", TAXONOMY_STATUSES)),
    check("taxonomy_terms_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("taxonomy_terms_not_own_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    check(
      "taxonomy_terms_merged_consistency",
      sql`(status = 'merged') = (${t.mergedIntoId} IS NOT NULL)`,
    ),
    index("taxonomy_terms_parent_idx").on(t.parentId),
  ],
);

export const taxonomyTermTranslations = appSchema.table(
  "taxonomy_term_translations",
  {
    termId: uuid("term_id")
      .notNull()
      .references(() => taxonomyTerms.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => [
    primaryKey({ columns: [t.termId, t.locale] }),
    check("taxonomy_term_translations_locale_format", sql`${t.locale} ~ '^[a-z]{2}(-[A-Z]{2})?$'`),
  ],
);

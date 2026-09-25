import { sql } from "drizzle-orm";
import { char, check, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/server/modules/auth";
import { appSchema } from "@/server/platform/db/tables/platform";
import { countries, taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { checkIn } from "@/server/platform/db/sql-helpers";
import {
  ARTICLE_DISCLAIMER_KINDS,
  ARTICLE_SOURCE_TYPES,
  ARTICLE_STATUSES,
  type ArticleDisclaimerKind,
  type ArticleSource,
  type ArticleSourceType,
  type ArticleStatus,
} from "../domain/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Articles/guides (docs/19 Phase 12; docs/12 §14 content metadata). One table covers both
 * editorial guides and study-abroad content — `sourceType`/`disclaimerKind` distinguish an
 * official-sourced guide from a mentor's personal-experience writeup, and drive the same UI
 * disclaimer rules either way. */
export const articles = appSchema.table(
  "articles",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique("articles_slug_unique"),
    title: text("title").notNull(),
    /** Short standfirst shown on cards and in meta description fallback. */
    dek: text("dek"),
    bodyMd: text("body_md").notNull(),
    status: text("status").$type<ArticleStatus>().notNull().default("draft"),
    categoryTermId: uuid("category_term_id").references(() => taxonomyTerms.id),
    countryIso2: char("country_iso2", { length: 2 }).references(() => countries.iso2),
    universityId: uuid("university_id").references(() => universities.id),
    sourceType: text("source_type").$type<ArticleSourceType>().notNull().default("editorial"),
    sources: jsonb("sources").$type<ArticleSource[]>().notNull().default([]),
    disclaimerKind: text("disclaimer_kind").$type<ArticleDisclaimerKind | null>(),
    /** e.g. "Winter 2026/27" — the admissions/visa intake cycle this guide's specifics apply to. */
    appliesToIntake: text("applies_to_intake"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id),
    nextReviewDueAt: timestamp("next_review_due_at", { withTimezone: true }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("articles_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("articles_status_valid", checkIn("status", ARTICLE_STATUSES)),
    check("articles_source_type_valid", checkIn("source_type", ARTICLE_SOURCE_TYPES)),
    // Postgres CHECK constraints pass on NULL, so this plain IN-list also allows an unset
    // (non-sensitive-topic) article without a separate NULL branch.
    check("articles_disclaimer_kind_valid", checkIn("disclaimer_kind", ARTICLE_DISCLAIMER_KINDS)),
    check(
      "articles_published_at_consistency",
      sql`${t.status} = 'draft' OR ${t.publishedAt} IS NOT NULL`,
    ),
    index("articles_status_idx").on(t.status),
    index("articles_country_idx").on(t.countryIso2),
    index("articles_university_idx").on(t.universityId),
    index("articles_category_idx").on(t.categoryTermId),
    index("articles_review_due_idx").on(t.nextReviewDueAt),
  ],
);

/** 301 history for renamed article slugs (docs/22 §10.1: "Renamed slugs keep a slug_redirects
 * history"). Scoped to articles for now — the only content type this phase introduces with an
 * editor-controlled, renameable slug; mentor/event slugs are chosen once at creation and this
 * codebase has never needed to rename one. */
export const articleSlugRedirects = appSchema.table("article_slug_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

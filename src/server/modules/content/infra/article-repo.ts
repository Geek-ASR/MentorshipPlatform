import { and, desc, eq, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { articles, articleSlugRedirects } from "./tables";
import type {
  ArticleDisclaimerKind,
  ArticleSource,
  ArticleSourceType,
  ArticleStatus,
} from "../domain/types";

export type ArticleRow = typeof articles.$inferSelect;

export async function slugTaken(executor: Executor, slug: string, excludeId?: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: articles.id })
    .from(articles)
    .where(excludeId ? and(eq(articles.slug, slug), sql`${articles.id} <> ${excludeId}`) : eq(articles.slug, slug))
    .limit(1);
  return row !== undefined;
}

export type InsertArticleInput = {
  slug: string;
  title: string;
  dek: string | null;
  bodyMd: string;
  categoryTermId: string | null;
  countryIso2: string | null;
  universityId: string | null;
  sourceType: ArticleSourceType;
  sources: ArticleSource[];
  disclaimerKind: ArticleDisclaimerKind | null;
  appliesToIntake: string | null;
  authorUserId: string;
};

export async function insertArticle(executor: Executor, input: InsertArticleInput): Promise<ArticleRow> {
  const [row] = await executor
    .insert(articles)
    .values({ id: newId(), status: "draft", ...input })
    .returning();
  return row!;
}

export type ArticleEditableFields = Partial<
  Pick<
    ArticleRow,
    | "title"
    | "dek"
    | "bodyMd"
    | "categoryTermId"
    | "countryIso2"
    | "universityId"
    | "sourceType"
    | "sources"
    | "disclaimerKind"
    | "appliesToIntake"
  >
>;

export async function updateArticleFields(
  executor: Executor,
  id: string,
  fields: ArticleEditableFields,
): Promise<ArticleRow | undefined> {
  const [row] = await executor
    .update(articles)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();
  return row;
}

export async function renameArticleSlug(
  executor: Executor,
  id: string,
  oldSlug: string,
  newSlug: string,
): Promise<ArticleRow | undefined> {
  const [row] = await executor
    .update(articles)
    .set({ slug: newSlug, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();
  if (row) {
    await executor
      .insert(articleSlugRedirects)
      .values({ oldSlug, articleId: id })
      .onConflictDoUpdate({
        target: articleSlugRedirects.oldSlug,
        set: { articleId: id },
      });
  }
  return row;
}

export async function findRedirectTarget(executor: Executor, oldSlug: string): Promise<string | undefined> {
  const [row] = await executor
    .select({ slug: articles.slug })
    .from(articleSlugRedirects)
    .innerJoin(articles, eq(articles.id, articleSlugRedirects.articleId))
    .where(eq(articleSlugRedirects.oldSlug, oldSlug))
    .limit(1);
  return row?.slug;
}

export async function setArticleStatus(
  executor: Executor,
  id: string,
  status: ArticleStatus,
  fields: { publishedAt?: Date | null } = {},
): Promise<ArticleRow | undefined> {
  const [row] = await executor
    .update(articles)
    .set({ status, ...fields, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();
  return row;
}

export async function recordVerification(
  executor: Executor,
  id: string,
  input: { verifiedByUserId: string; lastVerifiedAt: Date; nextReviewDueAt: Date | null },
): Promise<ArticleRow | undefined> {
  const [row] = await executor
    .update(articles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();
  return row;
}

export async function findArticleById(executor: Executor, id: string): Promise<ArticleRow | undefined> {
  const [row] = await executor.select().from(articles).where(eq(articles.id, id)).limit(1);
  return row;
}

export async function findArticleBySlug(executor: Executor, slug: string): Promise<ArticleRow | undefined> {
  const [row] = await executor.select().from(articles).where(eq(articles.slug, slug)).limit(1);
  return row;
}

export async function findPublishedArticleBySlug(
  executor: Executor,
  slug: string,
): Promise<ArticleRow | undefined> {
  const [row] = await executor
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
    .limit(1);
  return row;
}

export type ArticleAdminFilters = {
  status?: ArticleStatus;
  dueForReview?: boolean;
};

export async function listArticlesForAdmin(
  executor: Executor,
  filters: ArticleAdminFilters = {},
): Promise<ArticleRow[]> {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(articles.status, filters.status));
  if (filters.dueForReview) {
    conditions.push(
      and(eq(articles.status, "published"), isNotNull(articles.nextReviewDueAt), lte(articles.nextReviewDueAt, sql`now()`))!,
    );
  }
  return executor
    .select()
    .from(articles)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(articles.updatedAt));
}

export type PublishedArticleFilters = {
  categoryTermId?: string;
  countryIso2?: string;
  universityId?: string;
  limit: number;
  offset: number;
};

export type PublishedArticleResult = ArticleRow & { total: number };

export async function listPublishedArticles(
  executor: Executor,
  filters: PublishedArticleFilters,
): Promise<PublishedArticleResult[]> {
  const conditions: SQL[] = [eq(articles.status, "published")];
  if (filters.categoryTermId) conditions.push(eq(articles.categoryTermId, filters.categoryTermId));
  if (filters.countryIso2) conditions.push(eq(articles.countryIso2, filters.countryIso2));
  if (filters.universityId) conditions.push(eq(articles.universityId, filters.universityId));

  const rows = await executor
    .select({ article: articles, total: sql<number>`count(*) over ()` })
    .from(articles)
    .where(and(...conditions))
    .orderBy(desc(articles.publishedAt))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows.map((row) => ({ ...row.article, total: Number(row.total) }));
}

/** Count only, for landing-page quality-threshold checks (docs/22 §10.6) — avoids fetching rows
 * when a page only needs to know whether at least one published guide exists for a scope. */
export async function countPublishedArticles(
  executor: Executor,
  filters: Pick<PublishedArticleFilters, "categoryTermId" | "countryIso2" | "universityId">,
): Promise<number> {
  const conditions: SQL[] = [eq(articles.status, "published")];
  if (filters.categoryTermId) conditions.push(eq(articles.categoryTermId, filters.categoryTermId));
  if (filters.countryIso2) conditions.push(eq(articles.countryIso2, filters.countryIso2));
  if (filters.universityId) conditions.push(eq(articles.universityId, filters.universityId));
  const [row] = await executor
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(and(...conditions));
  return Number(row?.count ?? 0);
}

export async function listArticlesByCountry(
  executor: Executor,
  countryIso2: string,
  limit: number,
): Promise<ArticleRow[]> {
  return executor
    .select()
    .from(articles)
    .where(and(eq(articles.status, "published"), eq(articles.countryIso2, countryIso2)))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}

export async function listArticlesByUniversity(
  executor: Executor,
  universityId: string,
  limit: number,
): Promise<ArticleRow[]> {
  return executor
    .select()
    .from(articles)
    .where(and(eq(articles.status, "published"), eq(articles.universityId, universityId)))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}

export async function listArticlesByCategory(
  executor: Executor,
  categoryTermId: string,
  limit: number,
): Promise<ArticleRow[]> {
  return executor
    .select()
    .from(articles)
    .where(and(eq(articles.status, "published"), eq(articles.categoryTermId, categoryTermId)))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}

/** Distinct countries with at least one published guide, for `/study-abroad`'s hub counts. */
export async function countPublishedArticlesPerCountry(
  executor: Executor,
): Promise<Map<string, number>> {
  const rows = await executor
    .select({ countryIso2: articles.countryIso2, count: sql<number>`count(*)` })
    .from(articles)
    .where(and(eq(articles.status, "published"), isNotNull(articles.countryIso2)))
    .groupBy(articles.countryIso2);
  return new Map(rows.map((r) => [r.countryIso2 as string, Number(r.count)]));
}

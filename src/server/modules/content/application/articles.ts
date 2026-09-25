import type { Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { slugify } from "../domain/slug";
import { DEFAULT_REVIEW_INTERVAL_DAYS } from "../domain/types";
import type { ArticleDisclaimerKind, ArticleSource, ArticleSourceType } from "../domain/types";
import {
  type ArticleAdminFilters,
  type ArticleEditableFields,
  type ArticleRow,
  type PublishedArticleFilters,
  type PublishedArticleResult,
  countPublishedArticles,
  countPublishedArticlesPerCountry,
  findArticleById,
  findPublishedArticleBySlug,
  findRedirectTarget,
  insertArticle,
  listArticlesByCategory,
  listArticlesByCountry,
  listArticlesByUniversity,
  listArticlesForAdmin,
  listPublishedArticles as listPublishedArticlesRepo,
  recordVerification,
  renameArticleSlug,
  setArticleStatus,
  slugTaken,
  updateArticleFields,
} from "../infra/article-repo";

async function uniqueArticleSlug(
  executor: Executor,
  title: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(title) || "guide";
  let candidate = root;
  let suffix = 2;
  while (await slugTaken(executor, candidate, excludeId)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export type CreateArticleInput = {
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
};

/** New guides always start as `draft` (docs/19 Phase 12) — an editor publishes explicitly once
 * sources and disclaimers are in place, mirroring how a mentor application starts in `draft`. */
export async function createArticle(
  executor: Executor,
  actorUserId: string,
  input: CreateArticleInput,
): Promise<ArticleRow> {
  const slug = await uniqueArticleSlug(executor, input.title);
  const row = await insertArticle(executor, { ...input, slug, authorUserId: actorUserId });
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "article.created",
    targetType: "article",
    targetId: row.id,
    metadata: { title: input.title, slug },
  });
  return row;
}

export type UpdateArticleInput = ArticleEditableFields & { renameSlug?: boolean };

/** Editing an article never changes its slug automatically — a title edit that also wants a new
 * URL sets `renameSlug: true`, which regenerates the slug and leaves a redirect from the old one
 * (docs/22 §10.1). */
export async function updateArticle(
  executor: Executor,
  actorUserId: string,
  id: string,
  input: UpdateArticleInput,
): Promise<ArticleRow> {
  const existing = await findArticleById(executor, id);
  if (!existing) throw new AppError("NOT_FOUND", { detail: "Guide not found." });

  const { renameSlug, ...fields } = input;
  let row = await updateArticleFields(executor, id, fields);
  if (renameSlug && fields.title && fields.title !== existing.title) {
    const newSlug = await uniqueArticleSlug(executor, fields.title, id);
    row = await renameArticleSlug(executor, id, existing.slug, newSlug);
  }
  if (!row) throw new AppError("NOT_FOUND", { detail: "Guide not found." });

  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "article.updated",
    targetType: "article",
    targetId: id,
    metadata: { fields: Object.keys(fields) },
  });
  return row;
}

/** Publishing requires at least one source and a verification date — the same gate docs/12 §14's
 * freshness line depends on ("Last verified … · Sources: …"); a guide with no sources can't render
 * that line honestly. `lastVerifiedAt` defaults to now if the editor hasn't recorded one yet. */
export async function publishArticle(
  executor: Executor,
  actorUserId: string,
  id: string,
  options: { nextReviewDueAt?: Date | null } = {},
): Promise<ArticleRow> {
  const existing = await findArticleById(executor, id);
  if (!existing) throw new AppError("NOT_FOUND", { detail: "Guide not found." });
  if (existing.sources.length === 0) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        {
          path: "sources",
          code: "required",
          message: "Add at least one source before publishing.",
        },
      ],
    });
  }

  const now = new Date();
  const lastVerifiedAt = existing.lastVerifiedAt ?? now;
  const nextReviewDueAt =
    options.nextReviewDueAt ??
    existing.nextReviewDueAt ??
    new Date(lastVerifiedAt.getTime() + DEFAULT_REVIEW_INTERVAL_DAYS * 86_400_000);

  await recordVerification(executor, id, {
    verifiedByUserId: actorUserId,
    lastVerifiedAt,
    nextReviewDueAt,
  });
  const row = await setArticleStatus(executor, id, "published", {
    publishedAt: existing.publishedAt ?? now,
  });
  if (!row) throw new AppError("NOT_FOUND", { detail: "Guide not found." });

  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "article.published",
    targetType: "article",
    targetId: id,
    metadata: { slug: row.slug },
  });
  return row;
}

/** Records a fresh editorial review without changing publish status (docs/12 §14 review-due
 * queue) — moves `nextReviewDueAt` forward so the article drops off the queue. */
export async function verifyArticle(
  executor: Executor,
  actorUserId: string,
  id: string,
  options: { nextReviewDueAt?: Date | null } = {},
): Promise<ArticleRow> {
  const now = new Date();
  const nextReviewDueAt =
    options.nextReviewDueAt ?? new Date(now.getTime() + DEFAULT_REVIEW_INTERVAL_DAYS * 86_400_000);
  const row = await recordVerification(executor, id, {
    verifiedByUserId: actorUserId,
    lastVerifiedAt: now,
    nextReviewDueAt,
  });
  if (!row) throw new AppError("NOT_FOUND", { detail: "Guide not found." });
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "article.verified",
    targetType: "article",
    targetId: id,
    metadata: {},
  });
  return row;
}

export async function archiveArticle(
  executor: Executor,
  actorUserId: string,
  id: string,
  reason: string,
): Promise<ArticleRow> {
  const row = await setArticleStatus(executor, id, "archived");
  if (!row) throw new AppError("NOT_FOUND", { detail: "Guide not found." });
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "article.archived",
    targetType: "article",
    targetId: id,
    metadata: { reason },
  });
  return row;
}

export async function getArticleForAdmin(executor: Executor, id: string): Promise<ArticleRow> {
  const row = await findArticleById(executor, id);
  if (!row) throw new AppError("NOT_FOUND", { detail: "Guide not found." });
  return row;
}

export async function listArticlesForAdminList(
  executor: Executor,
  filters: ArticleAdminFilters = {},
): Promise<ArticleRow[]> {
  return listArticlesForAdmin(executor, filters);
}

/** Public read: resolves a slug to a published article, following one redirect hop for a renamed
 * slug (docs/22 §10.1: "Renamed slugs keep a slug_redirects history → 301"). Returns `null` when
 * nothing matches; `{ redirectTo }` when the slug was renamed, so the page can 301. */
export async function resolvePublicArticleSlug(
  executor: Executor,
  slug: string,
): Promise<{ article: ArticleRow } | { redirectTo: string } | null> {
  const article = await findPublishedArticleBySlug(executor, slug);
  if (article) return { article };
  const redirectTo = await findRedirectTarget(executor, slug);
  return redirectTo ? { redirectTo } : null;
}

export async function listPublishedArticles(
  executor: Executor,
  filters: PublishedArticleFilters,
): Promise<{ articles: PublishedArticleResult[]; total: number }> {
  const rows = await listPublishedArticlesRepo(executor, filters);
  return { articles: rows, total: rows[0]?.total ?? 0 };
}

export {
  countPublishedArticles,
  countPublishedArticlesPerCountry,
  listArticlesByCategory,
  listArticlesByCountry,
  listArticlesByUniversity,
};

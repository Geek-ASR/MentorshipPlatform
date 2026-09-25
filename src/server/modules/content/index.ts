/**
 * Public surface of the content module (docs/19 Phase 12). Other modules and route handlers depend
 * only on this file — never on `application/*`, `domain/*` or `infra/*` directly.
 */

export {
  createArticle,
  updateArticle,
  publishArticle,
  verifyArticle,
  archiveArticle,
  getArticleForAdmin,
  listArticlesForAdminList as listArticlesForAdmin,
  resolvePublicArticleSlug,
  listPublishedArticles,
  countPublishedArticles,
  countPublishedArticlesPerCountry,
  listArticlesByCategory,
  listArticlesByCountry,
  listArticlesByUniversity,
  type CreateArticleInput,
  type UpdateArticleInput,
} from "./application/articles";

export { articles, articleSlugRedirects } from "./infra/tables";
export type { ArticleRow, ArticleAdminFilters, PublishedArticleFilters } from "./infra/article-repo";

export {
  ARTICLE_STATUSES,
  ARTICLE_SOURCE_TYPES,
  ARTICLE_DISCLAIMER_KINDS,
  type ArticleStatus,
  type ArticleSourceType,
  type ArticleSource,
  type ArticleDisclaimerKind,
} from "./domain/types";

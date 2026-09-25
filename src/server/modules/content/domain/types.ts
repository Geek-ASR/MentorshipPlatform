export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** docs/12 §14 content metadata: where the information comes from. */
export const ARTICLE_SOURCE_TYPES = ["official", "mentor_experience", "community", "editorial"] as const;
export type ArticleSourceType = (typeof ARTICLE_SOURCE_TYPES)[number];

/** Matches `TaxonomyFlags.sensitiveTopic` (platform reference data) — the same vocabulary drives
 * both a taxonomy term's disclaimer flag and an article's own disclaimer banner. */
export const ARTICLE_DISCLAIMER_KINDS = ["immigration", "legal", "financial", "medical"] as const;
export type ArticleDisclaimerKind = (typeof ARTICLE_DISCLAIMER_KINDS)[number];

export type ArticleSource = {
  url: string;
  publisher: string;
  isOfficial: boolean;
  /** ISO date the source was accessed/checked. */
  accessedAt: string;
};

/** docs/12 §14 review cadence: how long a `last_verified_at` stays fresh before the review-due
 * queue picks the article up. Not in the settings registry — settings are for numeric business
 * rules admins tune per docs/17; this is an editorial default any editor can override per article
 * by setting `nextReviewDueAt` directly when publishing or re-verifying. */
export const DEFAULT_REVIEW_INTERVAL_DAYS = 180;

import { sql } from "drizzle-orm";
import type { Executor } from "./db/client";

export type RateLimitRule = {
  /** Namespaced bucket key, e.g. `auth.sign_in:ip:203.0.113.7`. */
  key: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

/**
 * Fixed-window counter backed by Postgres (atomic upsert). Replace with a Redis adapter at scale
 * (docs/16) without changing callers.
 */
export async function consumeRateLimit(
  executor: Executor,
  rule: RateLimitRule,
  now: Date,
): Promise<RateLimitResult> {
  if (rule.limit < 1 || rule.windowSeconds < 1) throw new Error("Invalid rate limit rule");
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);
  const expiresAt = new Date(resetAt.getTime() + windowMs);

  const rows = await executor.execute<{ count: number }>(sql`
    INSERT INTO app.rate_limit_buckets (key, window_start, count, expires_at)
    VALUES (${rule.key}, ${windowStart.toISOString()}::timestamptz, 1, ${expiresAt.toISOString()}::timestamptz)
    ON CONFLICT (key, window_start) DO UPDATE SET count = app.rate_limit_buckets.count + 1
    RETURNING count
  `);
  const count = Number(rows[0]?.count ?? rule.limit + 1);
  return {
    allowed: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt,
  };
}

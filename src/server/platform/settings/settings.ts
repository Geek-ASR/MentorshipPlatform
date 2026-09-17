import { and, desc, eq, lte, sql } from "drizzle-orm";
import { writeAudit } from "../audit";
import type { Database, Executor } from "../db/client";
import { featureFlags, platformSettings } from "../db/tables/platform";
import { AppError } from "../errors";
import { getLogger } from "../logger";
import {
  featureFlagRegistry,
  settingsRegistry,
  type FeatureFlagKey,
  type SettingKey,
  type SettingValue,
} from "./registry";

type CacheEntry = { value: unknown; expiresAt: number };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function clearSettingsCache(): void {
  cache.clear();
}

function readCache(
  cacheKey: string,
  nowMs: number,
): { hit: true; value: unknown } | { hit: false } {
  const entry = cache.get(cacheKey);
  return entry && entry.expiresAt > nowMs ? { hit: true, value: entry.value } : { hit: false };
}

/**
 * Returns the latest effective value, or the code default. A stored value that no longer matches
 * the schema (e.g. after a schema tightening) is ignored with an error log rather than applied.
 */
export async function getSetting<K extends SettingKey>(
  executor: Executor,
  key: K,
  now: Date,
  options: { bypassCache?: boolean } = {},
): Promise<SettingValue<K>> {
  const definition = settingsRegistry[key];
  const cacheKey = `setting:${key}`;
  if (!options.bypassCache) {
    const cached = readCache(cacheKey, now.getTime());
    if (cached.hit) return cached.value as SettingValue<K>;
  }

  const [row] = await executor
    .select({ value: platformSettings.value, version: platformSettings.version })
    .from(platformSettings)
    .where(and(eq(platformSettings.key, key), lte(platformSettings.effectiveFrom, now)))
    .orderBy(desc(platformSettings.version))
    .limit(1);

  let value: SettingValue<K> = definition.defaultValue as SettingValue<K>;
  if (row) {
    const parsed = definition.schema.safeParse(row.value);
    if (parsed.success) {
      value = parsed.data as SettingValue<K>;
    } else {
      getLogger().error(
        { event: "settings.invalid_stored_value", key, version: row.version },
        "invalid stored setting ignored",
      );
    }
  }
  cache.set(cacheKey, { value, expiresAt: now.getTime() + CACHE_TTL_MS });
  return value;
}

export type ChangeActor = { userId: string | null; actorType: "staff" | "system" };

/** Writes a new version of a setting and an audit record in one transaction. */
export async function updateSetting<K extends SettingKey>(
  db: Database,
  key: K,
  rawValue: unknown,
  change: ChangeActor & { reason: string; effectiveFrom?: Date },
): Promise<{ version: number }> {
  const definition = settingsRegistry[key];
  const parsed = definition.schema.safeParse(rawValue);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", {
      errors: parsed.error.issues.map((issue) => ({
        path: "value",
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  if (change.reason.trim().length < 3) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "reason", code: "too_small", message: "A reason is required" }],
    });
  }

  const version = await db.transaction(async (tx) => {
    // Serialize concurrent edits of the same key.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`setting:${key}`}))`);
    const [previous] = await tx
      .select({ value: platformSettings.value, version: platformSettings.version })
      .from(platformSettings)
      .where(eq(platformSettings.key, key))
      .orderBy(desc(platformSettings.version))
      .limit(1);
    const nextVersion = (previous?.version ?? 0) + 1;
    await tx.insert(platformSettings).values({
      key,
      version: nextVersion,
      value: parsed.data,
      effectiveFrom: change.effectiveFrom ?? new Date(),
      createdBy: change.userId,
      reason: change.reason.trim(),
    });
    await writeAudit(tx, {
      actorType: change.actorType,
      actorUserId: change.userId,
      action: "settings.updated",
      targetType: "setting",
      targetId: key,
      metadata: {
        version: nextVersion,
        before: previous?.value ?? definition.defaultValue,
        after: parsed.data,
        reason: change.reason.trim(),
      },
    });
    return nextVersion;
  });
  cache.delete(`setting:${key}`);
  return { version };
}

export async function isFeatureEnabled(
  executor: Executor,
  key: FeatureFlagKey,
  now: Date,
  options: { bypassCache?: boolean } = {},
): Promise<boolean> {
  const cacheKey = `flag:${key}`;
  if (!options.bypassCache) {
    const cached = readCache(cacheKey, now.getTime());
    if (cached.hit) return cached.value as boolean;
  }
  const [row] = await executor
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);
  const enabled = row?.enabled ?? featureFlagRegistry[key].defaultValue;
  cache.set(cacheKey, { value: enabled, expiresAt: now.getTime() + CACHE_TTL_MS });
  return enabled;
}

export async function setFeatureFlag(
  db: Database,
  key: FeatureFlagKey,
  enabled: boolean,
  change: ChangeActor & { reason: string },
): Promise<void> {
  if (change.reason.trim().length < 3) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "reason", code: "too_small", message: "A reason is required" }],
    });
  }
  await db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .for("update");
    await tx
      .insert(featureFlags)
      .values({ key, enabled, updatedBy: change.userId, reason: change.reason.trim() })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled, updatedBy: change.userId, reason: change.reason.trim() },
      });
    await writeAudit(tx, {
      actorType: change.actorType,
      actorUserId: change.userId,
      action: "feature_flag.updated",
      targetType: "feature_flag",
      targetId: key,
      metadata: {
        before: previous?.enabled ?? featureFlagRegistry[key].defaultValue,
        after: enabled,
        reason: change.reason.trim(),
      },
    });
  });
  cache.delete(`flag:${key}`);
}

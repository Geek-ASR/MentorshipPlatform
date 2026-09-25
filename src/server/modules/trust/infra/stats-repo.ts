import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { platformRatingStats, trustIngestionWatermark } from "./tables";

export async function getIngestionWatermark(executor: Executor): Promise<number> {
  const [row] = await executor
    .select()
    .from(trustIngestionWatermark)
    .where(eq(trustIngestionWatermark.id, 1));
  if (row) return row.lastAuditLogId;
  await executor
    .insert(trustIngestionWatermark)
    .values({ id: 1, lastAuditLogId: 0 })
    .onConflictDoNothing();
  return 0;
}

export async function setIngestionWatermark(
  executor: Executor,
  lastAuditLogId: number,
): Promise<void> {
  await executor
    .insert(trustIngestionWatermark)
    .values({ id: 1, lastAuditLogId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: trustIngestionWatermark.id,
      set: { lastAuditLogId, updatedAt: new Date() },
    });
}

export async function getPlatformMeanRating(executor: Executor): Promise<number> {
  const [row] = await executor
    .select()
    .from(platformRatingStats)
    .where(eq(platformRatingStats.id, 1));
  return row ? Number(row.meanRating) : 4.5;
}

export async function setPlatformMeanRating(executor: Executor, meanRating: number): Promise<void> {
  await executor
    .insert(platformRatingStats)
    .values({ id: 1, meanRating: meanRating.toFixed(2), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformRatingStats.id,
      set: { meanRating: meanRating.toFixed(2), updatedAt: new Date() },
    });
}

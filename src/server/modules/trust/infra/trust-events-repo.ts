import { and, desc, eq, gte } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { trustEvents } from "./tables";
import type { TrustEventType } from "../domain/types";

export type TrustEventRow = typeof trustEvents.$inferSelect;

export async function insertTrustEvent(
  executor: Executor,
  input: {
    subjectUserId: string;
    type: TrustEventType;
    points: number;
    occurredAt: Date;
    expiresAt: Date | null;
    sourceType: string;
    sourceId: string | null;
  },
): Promise<TrustEventRow | undefined> {
  const [row] = await executor
    .insert(trustEvents)
    .values({ id: newId(), excused: false, ...input })
    .onConflictDoNothing({
      target: [trustEvents.sourceType, trustEvents.sourceId, trustEvents.type],
    })
    .returning();
  return row;
}

/** Every non-excused event for a subject within the given lookback (the widest window any policy
 * rule needs, e.g. 365 days) — callers narrow further per-rule in the pure evaluator. */
export async function listRecentEventsForSubject(
  executor: Executor,
  subjectUserId: string,
  sinceDays: number,
  now: Date,
): Promise<TrustEventRow[]> {
  const since = new Date(now.getTime() - sinceDays * 86_400_000);
  return executor
    .select()
    .from(trustEvents)
    .where(and(eq(trustEvents.subjectUserId, subjectUserId), gte(trustEvents.occurredAt, since)))
    .orderBy(desc(trustEvents.occurredAt));
}

export async function excuseTrustEvent(
  executor: Executor,
  id: string,
  reason: string,
): Promise<TrustEventRow | undefined> {
  const [row] = await executor
    .update(trustEvents)
    .set({ excused: true, excuseReason: reason })
    .where(eq(trustEvents.id, id))
    .returning();
  return row;
}

/** Excuses every trust event sourced from a specific booking (docs/10 §7.4: an overturned appeal or
 * a dispute resolved for the mentor walks back the events that fed the original trigger). */
export async function excuseTrustEventsFromSource(
  executor: Executor,
  sourceType: string,
  sourceId: string,
  reason: string,
): Promise<void> {
  await executor
    .update(trustEvents)
    .set({ excused: true, excuseReason: reason })
    .where(and(eq(trustEvents.sourceType, sourceType), eq(trustEvents.sourceId, sourceId)));
}

export async function findTrustEvent(
  executor: Executor,
  id: string,
): Promise<TrustEventRow | undefined> {
  const [row] = await executor.select().from(trustEvents).where(eq(trustEvents.id, id)).limit(1);
  return row;
}

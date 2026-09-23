import { and, desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { webhookEvents } from "./tables";
import type { Provider, WebhookEventStatus } from "../domain/types";

export type WebhookEventRow = typeof webhookEvents.$inferSelect;

export type InsertWebhookEventResult =
  { inserted: true; row: WebhookEventRow } | { inserted: false };

/** Dedupes on `(provider, providerEventId)` (docs/08 §6 rule 2) — a retry delivery is a safe no-op. */
export async function insertWebhookEvent(
  executor: Executor,
  input: {
    provider: Provider;
    providerEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<InsertWebhookEventResult> {
  const rows = await executor
    .insert(webhookEvents)
    .values({ id: newId(), status: "received", ...input })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] })
    .returning();
  return rows[0] ? { inserted: true, row: rows[0] } : { inserted: false };
}

export async function findWebhookEvent(
  executor: Executor,
  id: string,
): Promise<WebhookEventRow | undefined> {
  const [row] = await executor
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, id))
    .limit(1);
  return row;
}

export async function setWebhookEventStatus(
  executor: Executor,
  id: string,
  status: WebhookEventStatus,
  now: Date,
): Promise<void> {
  await executor
    .update(webhookEvents)
    .set({ status, processedAt: status === "received" ? null : now })
    .where(eq(webhookEvents.id, id));
}

/** Admin webhook-events viewer (docs/06 §7.9). */
export async function listWebhookEvents(
  executor: Executor,
  limit = 100,
): Promise<WebhookEventRow[]> {
  return executor.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(limit);
}

export async function findWebhookEventByProviderEventId(
  executor: Executor,
  provider: Provider,
  providerEventId: string,
): Promise<WebhookEventRow | undefined> {
  const [row] = await executor
    .select()
    .from(webhookEvents)
    .where(
      and(eq(webhookEvents.provider, provider), eq(webhookEvents.providerEventId, providerEventId)),
    )
    .limit(1);
  return row;
}

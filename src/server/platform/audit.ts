import { and, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "./db/client";
import { auditLogs, type AuditActorType } from "./db/tables/platform";
import { getRequestContext } from "./request-context";

export type AuditEntry = {
  actorType: AuditActorType;
  actorUserId?: string | null;
  /** Dotted lowercase action name, e.g. `settings.updated`, `moderation.ban.applied`. */
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  /** Already-truncated network prefix (see http/client-ip.ts), never a full address. */
  ipPrefix?: string | null;
  userAgentHash?: string | null;
};

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|signature|otp|totp|card|cvv|iban|account_?number|vpa|aadhaar/i;

/** Removes sensitive keys (recursively) so audit metadata can never hold credentials or instruments. */
export function redactAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => redactAuditMetadata(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactAuditMetadata(inner, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

/**
 * Appends an audit record. Pass the same executor as the business change so the audit row commits
 * (or rolls back) atomically with it. id, prev_hash and row_hash are assigned by the DB trigger.
 */
export async function writeAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLogs).values({
    actorType: entry.actorType,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    requestId: entry.requestId ?? getRequestContext()?.requestId ?? null,
    ipPrefix: entry.ipPrefix ?? null,
    userAgentHash: entry.userAgentHash ?? null,
    metadata: (redactAuditMetadata(entry.metadata ?? {}) as Record<string, unknown>) ?? {},
  });
}

/** Returns the first audit row id whose hash chain fails verification, or null when intact. */
export async function verifyAuditChain(executor: Executor): Promise<number | null> {
  const rows = await executor.execute<{ broken_id: string | null }>(
    sql`select app.verify_audit_chain()::text as broken_id`,
  );
  const brokenId = rows[0]?.broken_id;
  return brokenId ? Number(brokenId) : null;
}

export type AuditLogRow = typeof auditLogs.$inferSelect;

/** docs/19 Phase 11 "audit log viewer" — most recent entries, optionally filtered by target type. */
export async function listAuditLogsForAdmin(
  executor: Executor,
  options: { targetType?: string; actorUserId?: string; limit?: number } = {},
): Promise<AuditLogRow[]> {
  const limit = options.limit ?? 100;
  const conditions = [];
  if (options.targetType) conditions.push(eq(auditLogs.targetType, options.targetType));
  if (options.actorUserId) conditions.push(eq(auditLogs.actorUserId, options.actorUserId));
  const query = executor.select().from(auditLogs);
  const rows = conditions.length
    ? await query
        .where(and(...conditions))
        .orderBy(desc(auditLogs.id))
        .limit(limit)
    : await query.orderBy(desc(auditLogs.id)).limit(limit);
  return rows;
}

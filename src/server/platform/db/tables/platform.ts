import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { checkIn } from "../sql-helpers";

/** All application tables live in the `app` schema (never `public`; see docs/05 §1). */
export const appSchema = pgSchema("app");

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ----------------------------------------------------------------------------------------------
 * Versioned business settings (docs/17). A new row per change; the latest effective version wins.
 * -------------------------------------------------------------------------------------------- */
export const platformSettings = appSchema.table(
  "platform_settings",
  {
    key: text("key").notNull(),
    version: integer("version").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.version] }),
    check("platform_settings_version_positive", sql`${t.version} > 0`),
    check("platform_settings_reason_present", sql`length(trim(${t.reason})) >= 3`),
  ],
);

export const featureFlags = appSchema.table("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedBy: uuid("updated_by"),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ----------------------------------------------------------------------------------------------
 * Transactional outbox (docs/04 §8). Rows are inserted in the same transaction as the state change.
 * -------------------------------------------------------------------------------------------- */
export const OUTBOX_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const outboxJobs = appSchema.table(
  "outbox_jobs",
  {
    id: uuid("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status").$type<OutboxStatus>().notNull().default("pending"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key").unique("outbox_jobs_dedupe_key_unique"),
    causationId: text("causation_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("outbox_jobs_status_valid", checkIn("status", OUTBOX_STATUSES)),
    check("outbox_jobs_attempts_valid", sql`${t.attempts} >= 0 AND ${t.maxAttempts} >= 1`),
    index("outbox_jobs_due_idx")
      .on(t.runAt)
      .where(sql`status = 'pending'`),
    index("outbox_jobs_stale_lock_idx")
      .on(t.lockedUntil)
      .where(sql`status = 'processing'`),
    index("outbox_jobs_failed_idx")
      .on(t.updatedAt)
      .where(sql`status = 'failed'`),
  ],
);

/* ----------------------------------------------------------------------------------------------
 * Idempotency keys (docs/06 §2). Scoped per actor + route; retained 24 h.
 * -------------------------------------------------------------------------------------------- */
export const idempotencyKeys = appSchema.table(
  "idempotency_keys",
  {
    actorKey: text("actor_key").notNull(),
    route: text("route").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").$type<"in_progress" | "completed">().notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<unknown>(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.actorKey, t.route, t.key] }),
    check("idempotency_keys_key_length", sql`length(${t.key}) BETWEEN 16 AND 128`),
    check("idempotency_keys_state_valid", sql`state IN ('in_progress', 'completed')`),
    index("idempotency_keys_expires_idx").on(t.expiresAt),
  ],
);

/* ----------------------------------------------------------------------------------------------
 * Fixed-window rate-limit counters (docs/11 §9.6). Swappable for Redis at scale.
 * -------------------------------------------------------------------------------------------- */
export const rateLimitBuckets = appSchema.table(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limit_buckets_expires_idx").on(t.expiresAt),
  ],
);

/* ----------------------------------------------------------------------------------------------
 * Append-only, hash-chained audit log (docs/05 §4.7). id and hashes are assigned by trigger.
 * -------------------------------------------------------------------------------------------- */
export const auditLogIdSeq = appSchema.sequence("audit_logs_id_seq");

export const AUDIT_ACTOR_TYPES = ["user", "staff", "system", "provider"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const auditLogs = appSchema.table(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .default(sql`nextval('app.audit_logs_id_seq')`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorType: text("actor_type").$type<AuditActorType>().notNull(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    requestId: text("request_id"),
    ipPrefix: inet("ip_prefix"),
    userAgentHash: text("user_agent_hash"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    prevHash: text("prev_hash"),
    rowHash: text("row_hash").notNull().default(""),
  },
  (t) => [
    check("audit_logs_actor_type_valid", checkIn("actor_type", AUDIT_ACTOR_TYPES)),
    check("audit_logs_action_format", sql`${t.action} ~ '^[a-z0-9_]+(\\.[a-z0-9_]+)+$'`),
    index("audit_logs_target_idx").on(t.targetType, t.targetId, t.occurredAt),
    index("audit_logs_actor_idx").on(t.actorUserId, t.occurredAt),
    index("audit_logs_occurred_brin").using("brin", t.occurredAt),
  ],
);

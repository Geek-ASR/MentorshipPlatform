import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/server/modules/auth";
import { mentorProfiles } from "@/server/modules/profiles";
import { appSchema } from "@/server/platform/db/tables/platform";
import { checkIn } from "@/server/platform/db/sql-helpers";
import {
  COMMISSION_SCOPE_TYPES,
  FEE_BEARERS,
  LEDGER_ACCOUNT_KINDS,
  LEDGER_DIRECTIONS,
  PAYMENT_INTENT_STATUSES,
  PAYMENT_STATUSES,
  PAYOUT_ACCOUNT_STATUSES,
  PROVIDERS,
  REFUND_INITIATORS,
  REFUND_STATUSES,
  TRANSFER_STATUSES,
  WEBHOOK_EVENT_STATUSES,
} from "../domain/types";
import type {
  CommissionScopeType,
  FeeBearer,
  LedgerAccountKind,
  LedgerDirection,
  PaymentIntentStatus,
  PaymentStatus,
  PayoutAccountStatus,
  Provider,
  RefundInitiator,
  RefundStatus,
  TransferStatus,
  WebhookEventStatus,
} from "../domain/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const orders = appSchema.table(
  "orders",
  {
    id: uuid("id").primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    createdAt: createdAt(),
  },
  (t) => [
    check("orders_total_non_negative", sql`${t.totalMinor} >= 0`),
    index("orders_student_idx").on(t.studentId),
  ],
);

export const orderItems = appSchema.table(
  "order_items",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // No FK to `bookings`: that would force payments -> booking, but booking's transaction needs to
    // call *into* payments to create this very row (booking -> payments). `bookings.order_item_id`
    // is the DB-enforced direction of this relationship instead; this column is a plain lookup key.
    bookingId: uuid("booking_id").notNull().unique("order_items_booking_unique"),
    // Denormalised from the booking transaction's own input (not looked up from `booking` at webhook
    // time) so webhook processing, ledger posting and transfer creation are all self-contained here —
    // payments never needs to call into booking (only booking calls into payments, docs/19 Phase 8).
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId),
    unitAmountMinor: bigint("unit_amount_minor", { mode: "number" }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    commissionRuleId: uuid("commission_rule_id"),
    percentBps: integer("percent_bps").notNull(),
    commissionMinor: bigint("commission_minor", { mode: "number" }).notNull(),
    mentorShareMinor: bigint("mentor_share_minor", { mode: "number" }).notNull(),
    studentFeeMinor: bigint("student_fee_minor", { mode: "number" }).notNull().default(0),
    feeBearer: text("fee_bearer").$type<FeeBearer>().notNull().default("mentor"),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    createdAt: createdAt(),
  },
  (t) => [
    check("order_items_fee_bearer_valid", checkIn("fee_bearer", FEE_BEARERS)),
    check("order_items_student_fee_non_negative", sql`${t.studentFeeMinor} >= 0`),
    check(
      "order_items_split_matches_amount",
      sql`${t.commissionMinor} + ${t.mentorShareMinor} = ${t.unitAmountMinor} * ${t.quantity}`,
    ),
    index("order_items_order_idx").on(t.orderId),
  ],
);

export const paymentIntents = appSchema.table(
  "payment_intents",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").$type<Provider>().notNull(),
    providerOrderId: text("provider_order_id")
      .notNull()
      .unique("payment_intents_provider_order_unique"),
    status: text("status").$type<PaymentIntentStatus>().notNull().default("created"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("payment_intents_provider_valid", checkIn("provider", PROVIDERS)),
    check("payment_intents_status_valid", checkIn("status", PAYMENT_INTENT_STATUSES)),
    index("payment_intents_order_idx").on(t.orderId),
  ],
);

export const payments = appSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey(),
    paymentIntentId: uuid("payment_intent_id")
      .notNull()
      .references(() => paymentIntents.id),
    provider: text("provider").$type<Provider>().notNull(),
    providerPaymentId: text("provider_payment_id")
      .notNull()
      .unique("payments_provider_payment_unique"),
    status: text("status").$type<PaymentStatus>().notNull().default("created"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    refundedMinor: bigint("refunded_minor", { mode: "number" }).notNull().default(0),
    feeMinor: bigint("fee_minor", { mode: "number" }).notNull().default(0),
    method: text("method"),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("payments_status_valid", checkIn("status", PAYMENT_STATUSES)),
    check(
      "payments_refunded_within_amount",
      sql`${t.refundedMinor} BETWEEN 0 AND ${t.amountMinor}`,
    ),
    index("payments_intent_idx").on(t.paymentIntentId),
  ],
);

export const refunds = appSchema.table(
  "refunds",
  {
    id: uuid("id").primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    status: text("status").$type<RefundStatus>().notNull().default("requested"),
    reasonCode: text("reason_code").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique("refunds_idempotency_key_unique"),
    provider: text("provider").$type<Provider>().notNull(),
    providerRefundId: text("provider_refund_id"),
    initiatedBy: text("initiated_by").$type<RefundInitiator>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("refunds_status_valid", checkIn("status", REFUND_STATUSES)),
    check("refunds_initiated_by_valid", checkIn("initiated_by", REFUND_INITIATORS)),
    check("refunds_amount_positive", sql`${t.amountMinor} > 0`),
    index("refunds_payment_idx").on(t.paymentId),
    uniqueIndex("refunds_provider_ref_unique")
      .on(t.provider, t.providerRefundId)
      .where(sql`provider_refund_id IS NOT NULL`),
  ],
);

export const payoutAccounts = appSchema.table(
  "payout_accounts",
  {
    id: uuid("id").primaryKey(),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" })
      .unique("payout_accounts_mentor_unique"),
    provider: text("provider").$type<Provider>().notNull(),
    providerAccountId: text("provider_account_id"),
    status: text("status").$type<PayoutAccountStatus>().notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check("payout_accounts_provider_valid", checkIn("provider", PROVIDERS)),
    check("payout_accounts_status_valid", checkIn("status", PAYOUT_ACCOUNT_STATUSES)),
  ],
);

export const transfers = appSchema.table(
  "transfers",
  {
    id: uuid("id").primaryKey(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id)
      .unique("transfers_order_item_unique"),
    payoutAccountId: uuid("payout_account_id")
      .notNull()
      .references(() => payoutAccounts.id),
    provider: text("provider").$type<Provider>().notNull(),
    providerTransferId: text("provider_transfer_id"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    status: text("status").$type<TransferStatus>().notNull().default("pending"),
    holdUntil: timestamp("hold_until", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("transfers_provider_valid", checkIn("provider", PROVIDERS)),
    check("transfers_status_valid", checkIn("status", TRANSFER_STATUSES)),
    index("transfers_payout_account_idx").on(t.payoutAccountId),
  ],
);

export const transferReversals = appSchema.table("transfer_reversals", {
  id: uuid("id").primaryKey(),
  transferId: uuid("transfer_id")
    .notNull()
    .references(() => transfers.id),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

export const commissionRules = appSchema.table(
  "commission_rules",
  {
    id: uuid("id").primaryKey(),
    scopeType: text("scope_type").$type<CommissionScopeType>().notNull(),
    scopeRef: text("scope_ref"),
    percentBps: integer("percent_bps").notNull(),
    fixedMinor: bigint("fixed_minor", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    minFeeMinor: bigint("min_fee_minor", { mode: "number" }),
    maxFeeMinor: bigint("max_fee_minor", { mode: "number" }),
    feeBearer: text("fee_bearer").$type<FeeBearer>().notNull().default("mentor"),
    studentFeeBps: integer("student_fee_bps"),
    priority: integer("priority").notNull().default(0),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("commission_rules_scope_type_valid", checkIn("scope_type", COMMISSION_SCOPE_TYPES)),
    check("commission_rules_fee_bearer_valid", checkIn("fee_bearer", FEE_BEARERS)),
    check("commission_rules_percent_valid", sql`${t.percentBps} BETWEEN 0 AND 10000`),
    index("commission_rules_scope_idx").on(t.scopeType, t.scopeRef, t.currency),
  ],
);

export const ledgerAccounts = appSchema.table(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<LedgerAccountKind>().notNull(),
    refId: uuid("ref_id"),
    currency: char("currency", { length: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("ledger_accounts_kind_valid", checkIn("kind", LEDGER_ACCOUNT_KINDS)),
    uniqueIndex("ledger_accounts_platform_unique")
      .on(t.kind, t.currency)
      .where(sql`ref_id IS NULL`),
    uniqueIndex("ledger_accounts_scoped_unique")
      .on(t.kind, t.refId, t.currency)
      .where(sql`ref_id IS NOT NULL`),
  ],
);

export const ledgerJournals = appSchema.table("ledger_journals", {
  id: uuid("id").primaryKey(),
  idempotencyKey: text("idempotency_key")
    .notNull()
    .unique("ledger_journals_idempotency_key_unique"),
  description: text("description").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

export const ledgerLines = appSchema.table(
  "ledger_lines",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => ledgerJournals.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    direction: text("direction").$type<LedgerDirection>().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
  },
  (t) => [
    check("ledger_lines_direction_valid", checkIn("direction", LEDGER_DIRECTIONS)),
    check("ledger_lines_amount_positive", sql`${t.amountMinor} > 0`),
    index("ledger_lines_journal_idx").on(t.journalId),
    index("ledger_lines_account_idx").on(t.accountId),
  ],
);

export const webhookEvents = appSchema.table(
  "webhook_events",
  {
    id: uuid("id").primaryKey(),
    provider: text("provider").$type<Provider>().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").$type<WebhookEventStatus>().notNull().default("received"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    check("webhook_events_provider_valid", checkIn("provider", PROVIDERS)),
    check("webhook_events_status_valid", checkIn("status", WEBHOOK_EVENT_STATUSES)),
    uniqueIndex("webhook_events_provider_event_unique").on(t.provider, t.providerEventId),
  ],
);

/**
 * Simulates "the outside world" for local dev and tests (docs/08 §14): a separate schema so the
 * fake provider's own state is genuinely independent of our domain rows, the same way a real PSP's
 * state would be. The webhook receiver and payment sweeper treat this exactly like a live provider.
 */
export const fakePsp = pgSchema("fake_psp");

export const FAKE_PAYMENT_ATTEMPT_STATUSES = [
  "created",
  "authorized",
  "captured",
  "failed",
] as const;
export type FakePaymentAttemptStatus = (typeof FAKE_PAYMENT_ATTEMPT_STATUSES)[number];

export const fakePaymentAttempts = fakePsp.table(
  "payment_attempts",
  {
    id: uuid("id").primaryKey(),
    providerOrderId: text("provider_order_id")
      .notNull()
      .unique("fake_payment_attempts_order_unique"),
    providerPaymentId: text("provider_payment_id").unique("fake_payment_attempts_payment_unique"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    status: text("status").$type<FakePaymentAttemptStatus>().notNull().default("created"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check("fake_payment_attempts_status_valid", checkIn("status", FAKE_PAYMENT_ATTEMPT_STATUSES)),
  ],
);

export const FAKE_REFUND_STATUSES = ["pending", "processed", "failed"] as const;
export type FakeRefundStatus = (typeof FAKE_REFUND_STATUSES)[number];

export const fakeRefundAttempts = fakePsp.table(
  "refund_attempts",
  {
    id: uuid("id").primaryKey(),
    providerRefundId: text("provider_refund_id")
      .notNull()
      .unique("fake_refund_attempts_refund_unique"),
    providerPaymentId: text("provider_payment_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    status: text("status").$type<FakeRefundStatus>().notNull().default("pending"),
    createdAt: createdAt(),
  },
  () => [check("fake_refund_attempts_status_valid", checkIn("status", FAKE_REFUND_STATUSES))],
);

export const FAKE_LINKED_ACCOUNT_STATUSES = ["pending", "active", "rejected"] as const;
export type FakeLinkedAccountStatus = (typeof FAKE_LINKED_ACCOUNT_STATUSES)[number];

export const fakeLinkedAccounts = fakePsp.table(
  "linked_accounts",
  {
    id: uuid("id").primaryKey(),
    status: text("status").$type<FakeLinkedAccountStatus>().notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check("fake_linked_accounts_status_valid", checkIn("status", FAKE_LINKED_ACCOUNT_STATUSES)),
  ],
);

export const FAKE_TRANSFER_STATUSES = ["created", "on_hold", "released", "reversed"] as const;
export type FakeTransferStatus = (typeof FAKE_TRANSFER_STATUSES)[number];

export const fakeTransfers = fakePsp.table(
  "transfers",
  {
    id: uuid("id").primaryKey(),
    providerTransferId: text("provider_transfer_id")
      .notNull()
      .unique("fake_transfers_transfer_unique"),
    linkedAccountId: uuid("linked_account_id")
      .notNull()
      .references(() => fakeLinkedAccounts.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    status: text("status").$type<FakeTransferStatus>().notNull().default("created"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("fake_transfers_status_valid", checkIn("status", FAKE_TRANSFER_STATUSES))],
);

CREATE SCHEMA "fake_psp";
--> statement-breakpoint
CREATE TABLE "app"."commission_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_type" text NOT NULL,
	"scope_ref" text,
	"percent_bps" integer NOT NULL,
	"fixed_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"min_fee_minor" bigint,
	"max_fee_minor" bigint,
	"fee_bearer" text DEFAULT 'mentor' NOT NULL,
	"student_fee_bps" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rules_scope_type_valid" CHECK (scope_type IN ('global', 'service_kind', 'category', 'promotion', 'mentor')),
	CONSTRAINT "commission_rules_fee_bearer_valid" CHECK (fee_bearer IN ('mentor', 'student', 'split')),
	CONSTRAINT "commission_rules_percent_valid" CHECK ("app"."commission_rules"."percent_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "fake_psp"."linked_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fake_linked_accounts_status_valid" CHECK (status IN ('pending', 'active', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "fake_psp"."payment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fake_payment_attempts_order_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "fake_payment_attempts_payment_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "fake_payment_attempts_status_valid" CHECK (status IN ('created', 'authorized', 'captured', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "fake_psp"."refund_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_refund_id" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fake_refund_attempts_refund_unique" UNIQUE("provider_refund_id"),
	CONSTRAINT "fake_refund_attempts_status_valid" CHECK (status IN ('pending', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "fake_psp"."transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_transfer_id" text NOT NULL,
	"linked_account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fake_transfers_transfer_unique" UNIQUE("provider_transfer_id"),
	CONSTRAINT "fake_transfers_status_valid" CHECK (status IN ('created', 'on_hold', 'released', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "app"."ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_kind_valid" CHECK (kind IN ('psp_clearing', 'mentor_payable', 'commission_revenue', 'psp_fees', 'refund_costs', 'chargeback_losses', 'mentor_receivable'))
);
--> statement-breakpoint
CREATE TABLE "app"."ledger_journals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_journals_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "app"."ledger_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	CONSTRAINT "ledger_lines_direction_valid" CHECK (direction IN ('debit', 'credit')),
	CONSTRAINT "ledger_lines_amount_positive" CHECK ("app"."ledger_lines"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"commission_rule_id" uuid,
	"percent_bps" integer NOT NULL,
	"commission_minor" bigint NOT NULL,
	"mentor_share_minor" bigint NOT NULL,
	"student_fee_minor" bigint DEFAULT 0 NOT NULL,
	"fee_bearer" text DEFAULT 'mentor' NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_booking_unique" UNIQUE("booking_id"),
	CONSTRAINT "order_items_fee_bearer_valid" CHECK (fee_bearer IN ('mentor', 'student', 'split')),
	CONSTRAINT "order_items_student_fee_non_negative" CHECK ("app"."order_items"."student_fee_minor" >= 0),
	CONSTRAINT "order_items_split_matches_amount" CHECK ("app"."order_items"."commission_minor" + "app"."order_items"."mentor_share_minor" = "app"."order_items"."unit_amount_minor" * "app"."order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_non_negative" CHECK ("app"."orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_provider_order_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payment_intents_provider_valid" CHECK (provider IN ('fake', 'razorpay')),
	CONSTRAINT "payment_intents_status_valid" CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "app"."payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"method" text,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_payment_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payments_status_valid" CHECK (status IN ('created', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed', 'disputed')),
	CONSTRAINT "payments_refunded_within_amount" CHECK ("app"."payments"."refunded_minor" BETWEEN 0 AND "app"."payments"."amount_minor")
);
--> statement-breakpoint
CREATE TABLE "app"."payout_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mentor_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_accounts_mentor_unique" UNIQUE("mentor_user_id"),
	CONSTRAINT "payout_accounts_provider_valid" CHECK (provider IN ('fake', 'razorpay')),
	CONSTRAINT "payout_accounts_status_valid" CHECK (status IN ('pending', 'active', 'rejected', 'deactivated'))
);
--> statement-breakpoint
CREATE TABLE "app"."refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason_code" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider" text NOT NULL,
	"provider_refund_id" text,
	"initiated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "refunds_status_valid" CHECK (status IN ('requested', 'pending', 'processed', 'failed')),
	CONSTRAINT "refunds_initiated_by_valid" CHECK (initiated_by IN ('system', 'student', 'mentor', 'staff')),
	CONSTRAINT "refunds_amount_positive" CHECK ("app"."refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."transfer_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transfer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"payout_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_transfer_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"hold_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_order_item_unique" UNIQUE("order_item_id"),
	CONSTRAINT "transfers_provider_valid" CHECK (provider IN ('fake', 'razorpay')),
	CONSTRAINT "transfers_status_valid" CHECK (status IN ('pending', 'on_hold', 'released', 'cancelled', 'reversed', 'partially_reversed', 'settled', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "app"."webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_provider_valid" CHECK (provider IN ('fake', 'razorpay')),
	CONSTRAINT "webhook_events_status_valid" CHECK (status IN ('received', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "app"."bookings" ADD COLUMN "order_item_id" uuid;--> statement-breakpoint
ALTER TABLE "fake_psp"."transfers" ADD CONSTRAINT "transfers_linked_account_id_linked_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "fake_psp"."linked_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ledger_lines" ADD CONSTRAINT "ledger_lines_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "app"."ledger_journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ledger_lines" ADD CONSTRAINT "ledger_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "app"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payout_accounts" ADD CONSTRAINT "payout_accounts_mentor_user_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "app"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "app"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transfer_reversals" ADD CONSTRAINT "transfer_reversals_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "app"."transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transfers" ADD CONSTRAINT "transfers_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "app"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transfers" ADD CONSTRAINT "transfers_payout_account_id_payout_accounts_id_fk" FOREIGN KEY ("payout_account_id") REFERENCES "app"."payout_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_rules_scope_idx" ON "app"."commission_rules" USING btree ("scope_type","scope_ref","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_platform_unique" ON "app"."ledger_accounts" USING btree ("kind","currency") WHERE ref_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_scoped_unique" ON "app"."ledger_accounts" USING btree ("kind","ref_id","currency") WHERE ref_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ledger_lines_journal_idx" ON "app"."ledger_lines" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "ledger_lines_account_idx" ON "app"."ledger_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "app"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_student_idx" ON "app"."orders" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "payment_intents_order_idx" ON "app"."payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_intent_idx" ON "app"."payments" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "app"."refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_ref_unique" ON "app"."refunds" USING btree ("provider","provider_refund_id") WHERE provider_refund_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transfers_payout_account_idx" ON "app"."transfers" USING btree ("payout_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_unique" ON "app"."webhook_events" USING btree ("provider","provider_event_id");
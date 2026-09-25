import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  inet,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CAPABILITIES, ROLES, USER_STATUSES } from "@/server/platform/authz/actor";
import { appSchema } from "@/server/platform/db/tables/platform";
import { checkIn, citext } from "@/server/platform/db/sql-helpers";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ----------------------------------------------------------------------------------------------
 * Identity (docs/05 §3.1, docs/07). One account per person; roles and login methods are separate.
 * -------------------------------------------------------------------------------------------- */
export const users = appSchema.table(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: citext("email").notNull().unique("users_email_unique"),
    emailVerified: boolean("email_verified").notNull().default(false),
    displayName: text("display_name").notNull(),
    status: text("status").$type<(typeof USER_STATUSES)[number]>().notNull().default("active"),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale"),
    countryIso2: char("country_iso2", { length: 2 }),
    birthYear: smallint("birth_year").notNull(),
    adultAttestedAt: timestamp("adult_attested_at", { withTimezone: true }).notNull(),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_status_valid", checkIn("status", USER_STATUSES)),
    check("users_display_name_present", sql`length(trim(${t.displayName})) >= 1`),
    check("users_birth_year_plausible", sql`${t.birthYear} BETWEEN 1900 AND 2100`),
  ],
);

export const AUTH_PROVIDERS = ["credential", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** Login methods. `provider_account_id` is the normalised email for credential, Google `sub` for google. */
export const authAccounts = appSchema.table(
  "auth_accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<AuthProvider>().notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    /** Argon2id-encoded hash string (params embedded); null for oauth-only accounts. */
    passwordHash: text("password_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("auth_accounts_provider_valid", checkIn("provider", AUTH_PROVIDERS)),
    unique("auth_accounts_provider_account_unique").on(t.provider, t.providerAccountId),
    unique("auth_accounts_user_provider_unique").on(t.userId, t.provider),
    index("auth_accounts_user_idx").on(t.userId),
  ],
);

/** DB-backed sessions (docs/07 §5). Only a hash of the bearer token is ever stored. */
export const authSessions = appSchema.table(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique("auth_sessions_token_hash_unique"),
    /** Instant of the last primary authentication (password/OAuth), for step-up checks. */
    authTime: timestamp("auth_time", { withTimezone: true }).notNull(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipPrefix: inet("ip_prefix"),
    userAgentHash: text("user_agent_hash"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("auth_sessions_user_idx").on(t.userId, t.revokedAt),
    index("auth_sessions_expires_idx").on(t.expiresAt),
  ],
);

export const AUTH_TOKEN_PURPOSES = [
  "email_verify",
  "password_reset",
  "email_change",
  "email_change_revert",
  "mfa_pending",
] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

/** Single-use, hashed tokens for email verification, password reset and email-change confirmation. */
export const authVerificationTokens = appSchema.table(
  "auth_verification_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<AuthTokenPurpose>().notNull(),
    tokenHash: text("token_hash").notNull().unique("auth_verification_tokens_hash_unique"),
    /** e.g. `{ newEmail }` for email_change. Never a credential. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("auth_verification_tokens_purpose_valid", checkIn("purpose", AUTH_TOKEN_PURPOSES)),
    index("auth_verification_tokens_user_idx").on(t.userId, t.purpose),
    index("auth_verification_tokens_expires_idx").on(t.expiresAt),
  ],
);

/** TOTP enrolment (docs/07 §3.6). Secret is encrypted at rest (AES-256-GCM, application key). */
export const authTwoFactors = appSchema.table("auth_two_factors", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretCiphertext: text("secret_ciphertext").notNull(),
  secretIv: text("secret_iv").notNull(),
  secretTag: text("secret_tag").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  /** Last accepted HOTP counter, to block replay of an already-used code. */
  lastUsedCounter: text("last_used_counter"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authBackupCodes = appSchema.table(
  "auth_backup_codes",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("auth_backup_codes_user_hash_unique").on(t.userId, t.codeHash),
    index("auth_backup_codes_user_idx").on(t.userId),
  ],
);

/** Capability roles (docs/07 §6.1). `student` is granted automatically; all others need an admin. */
export const userRoles = appSchema.table(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    grantedBy: uuid("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role] }),
    check("user_roles_role_valid", checkIn("role", ROLES)),
  ],
);

export const CONSENT_KINDS = ["terms", "privacy"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Versioned consent records (docs/07 §3.1). A new row per acceptance; never overwritten. */
export const userConsents = appSchema.table(
  "user_consents",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ConsentKind>().notNull(),
    version: text("version").notNull(),
    ipPrefix: inet("ip_prefix"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("user_consents_kind_valid", checkIn("kind", CONSENT_KINDS)),
    index("user_consents_user_idx").on(t.userId, t.kind),
  ],
);

/**
 * One-directional blocks (docs/05 §4.6, docs/10 Phase 10). Either party may block unilaterally, no
 * counterparty consent needed (matches every consumer platform's block model); `isBlocked` checks
 * both directions since a block from *either* side makes the pair unavailable to each other
 * (docs/09 §5: "no block between the two users," not "the student hasn't blocked the mentor"). Owned
 * by `auth` rather than the new `trust` module specifically so `booking` (which already depends on
 * `auth`) can call the read-side directly without creating a `booking -> trust -> booking` cycle —
 * `trust` still owns the moderator-facing side of blocking (e.g. a forced block after a harassment
 * report), calling into this same table via `auth`'s public index.
 */
export const userBlocks = appSchema.table(
  "user_blocks",
  {
    id: uuid("id").primaryKey(),
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reasonCode: text("reason_code"),
    createdAt: createdAt(),
  },
  (t) => [
    check("user_blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
    uniqueIndex("user_blocks_pair_unique").on(t.blockerId, t.blockedId),
    index("user_blocks_blocked_idx").on(t.blockedId),
  ],
);

/**
 * Materialised, currently-active capability restrictions (docs/10 §7.3) — the table
 * `activeRestriction()` (src/server/platform/authz/actor.ts) is checking once `resolveSessionActor`
 * hydrates `UserActor.restrictions` from this table. Owned by `auth` for the same cycle-avoiding
 * reason as `user_blocks` above: `trust` (which decides *when* to restrict someone) writes here
 * through `auth`'s public index; nothing in `auth` ever needs to know about `trust`.
 */
export const userRestrictions = appSchema.table(
  "user_restrictions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    /** null = until lifted by staff (docs/10 §7.3 `reinstate`) — matches the `Restriction.until` shape. */
    until: timestamp("until", { withTimezone: true }),
    reasonCode: text("reason_code").notNull(),
    /** The `moderation_actions.id` (owned by `trust`) that created this row — a plain uuid, not an FK,
     * for the same reason `payments.order_items.booking_id` isn't an FK to `bookings` (ADR-029): the
     * owning row lives in a module `auth` must never import. */
    sourceActionId: uuid("source_action_id"),
    createdAt: createdAt(),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
  },
  (t) => [
    check("user_restrictions_capability_valid", checkIn("capability", CAPABILITIES)),
    index("user_restrictions_active_idx")
      .on(t.userId, t.capability)
      .where(sql`lifted_at IS NULL`),
  ],
);

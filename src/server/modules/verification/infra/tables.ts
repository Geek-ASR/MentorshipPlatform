import { check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/server/modules/auth";
import { mentorAffiliations } from "@/server/modules/profiles";
import { appSchema } from "@/server/platform/db/tables/platform";
import { checkIn } from "@/server/platform/db/sql-helpers";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const VERIFICATION_METHODS = ["university_email", "work_email"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const VERIFICATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "revoked",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * Document-upload verification (docs/10 §2.3) is deliberately out of scope this phase — it needs an
 * ObjectStore adapter decision, magic-byte checks and a reviewer UI, tracked as a follow-up. Only the
 * email-challenge method exists here, so `pending` here means "challenge link sent, not yet clicked".
 */
export const verificationRequests = appSchema.table(
  "verification_requests",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    affiliationId: uuid("affiliation_id")
      .notNull()
      .references(() => mentorAffiliations.id, { onDelete: "cascade" }),
    method: text("method").$type<VerificationMethod>().notNull(),
    status: text("status").$type<VerificationStatus>().notNull().default("pending"),
    challengedEmail: text("challenged_email").notNull(),
    /** Hash of the single-use challenge link token; null once consumed. */
    tokenHash: text("token_hash").unique("verification_requests_token_hash_unique"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("verification_requests_method_valid", checkIn("method", VERIFICATION_METHODS)),
    check("verification_requests_status_valid", checkIn("status", VERIFICATION_STATUSES)),
    index("verification_requests_user_idx").on(t.userId),
    index("verification_requests_affiliation_idx").on(t.affiliationId),
  ],
);

export const CREDENTIAL_KINDS = ["university_email", "work_email"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_STATUSES = ["active", "expired", "revoked"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const credentials = appSchema.table(
  "credentials",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    affiliationId: uuid("affiliation_id").references(() => mentorAffiliations.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<CredentialKind>().notNull(),
    /** Public evidence-badge text (docs/10 §2.1), e.g. "Education: TU Munich — university email confirmed". */
    publicLabel: text("public_label").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").$type<CredentialStatus>().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("credentials_kind_valid", checkIn("kind", CREDENTIAL_KINDS)),
    check("credentials_status_valid", checkIn("status", CREDENTIAL_STATUSES)),
    index("credentials_user_idx").on(t.userId),
    index("credentials_affiliation_idx").on(t.affiliationId),
  ],
);

/** One verified address -> one account (docs/10 §2.2 anti-fraud: shared/forwarded address abuse). */
export const verifiedEmailFingerprints = appSchema.table("verified_email_fingerprints", {
  emailHash: text("email_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
});

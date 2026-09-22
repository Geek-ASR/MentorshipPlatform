import { z } from "zod";

/**
 * Registry of configurable business settings (docs/17). Code owns the schema and default;
 * admins own the value (versioned in app.platform_settings). Unknown keys are rejected.
 */
export type SettingDefinition<T> = {
  schema: z.ZodType<T>;
  defaultValue: T;
  description: string;
  /** Critical keys require super_admin to change (enforced by the admin module). */
  critical?: boolean;
};

function defineSetting<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  const parsed = definition.schema.safeParse(definition.defaultValue);
  if (!parsed.success) throw new Error(`Invalid default for setting: ${definition.description}`);
  return definition;
}

export const settingsRegistry = {
  "age_policy.min_age": defineSetting({
    schema: z.number().int().min(13).max(21),
    defaultValue: 18,
    description: "Minimum age to create an account.",
    critical: true,
  }),
  "auth.password_min_length": defineSetting({
    schema: z.number().int().min(8).max(64),
    defaultValue: 12,
    description: "Minimum password length.",
    critical: true,
  }),
  "auth.recent_auth_window_min": defineSetting({
    schema: z.number().int().min(5).max(30),
    defaultValue: 10,
    description: "Minutes a sign-in counts as recent for step-up protected actions.",
  }),
  "account.deletion_grace_days": defineSetting({
    schema: z.number().int().min(7).max(30),
    defaultValue: 14,
    description: "Days before a requested account deletion is executed.",
  }),
  "booking.hold_ttl_min": defineSetting({
    schema: z.number().int().min(5).max(30),
    defaultValue: 10,
    description: "Minutes a slot is held while payment is in progress.",
  }),
  "mentor.eligibility_reattest_days": defineSetting({
    schema: z.number().int().min(90).max(730),
    defaultValue: 365,
    description: "How often a mentor must re-confirm their work-eligibility attestation.",
  }),
  "mentor_eligibility.country_rules": defineSetting({
    schema: z.record(
      z.string().regex(/^(\*|[A-Z]{2})$/, "must be ISO 3166-1 alpha-2 or *"),
      z.record(
        z.enum(["citizen_or_pr", "work_authorised", "student_visa", "not_authorised", "other"]),
        z.enum(["volunteer", "paid"]),
      ),
    ),
    defaultValue: {
      "*": {
        citizen_or_pr: "paid",
        work_authorised: "paid",
        student_visa: "volunteer",
        not_authorised: "volunteer",
        other: "volunteer",
      },
    },
    description:
      "Maps a mentor's residency status to volunteer/paid mode, per country (docs/17 §3).",
    critical: true,
  }),
  "verification.university_email_expiry_days": defineSetting({
    schema: z.object({
      current: z.number().int().min(30).max(1095),
      alumni: z.number().int().min(30).max(1095),
    }),
    defaultValue: { current: 365, alumni: 730 },
    description: "Credential lifetime for a university email challenge, by domain kind.",
  }),
  "verification.work_email_expiry_days": defineSetting({
    schema: z.number().int().min(30).max(1095),
    defaultValue: 365,
    description: "Credential lifetime for a work email challenge.",
  }),
} as const satisfies Record<string, SettingDefinition<unknown>>;

export type SettingKey = keyof typeof settingsRegistry;
export type SettingValue<K extends SettingKey> = (typeof settingsRegistry)[K]["defaultValue"];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingsRegistry, key);
}

export const featureFlagRegistry = {
  "signup.enabled": { defaultValue: true, description: "Allow new account sign-ups." },
  "booking.enabled": { defaultValue: true, description: "Allow creating new bookings." },
  "payments.enabled": {
    defaultValue: true,
    description: "Allow starting payments (sandbox or live).",
  },
  "payments.live": {
    defaultValue: false,
    description: "Use live payment keys. Production-critical gate.",
  },
  "messaging.enabled": { defaultValue: true, description: "Allow sending messages." },
  "mentor_applications.enabled": {
    defaultValue: true,
    description: "Allow submitting new mentor applications.",
  },
  "uploads.enabled": { defaultValue: true, description: "Allow file uploads." },
  "community.enabled": { defaultValue: false, description: "Community Q&A (Beta)." },
} as const satisfies Record<string, { defaultValue: boolean; description: string }>;

export type FeatureFlagKey = keyof typeof featureFlagRegistry;

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return Object.hasOwn(featureFlagRegistry, key);
}

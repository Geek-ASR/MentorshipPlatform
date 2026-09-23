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
  "scheduling.slot_step_min": defineSetting({
    schema: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    defaultValue: 30,
    description:
      "Default slot granularity offered to new mentors (mentor-configurable per docs/09).",
  }),
  "scheduling.buffer_after_min": defineSetting({
    schema: z.number().int().min(0).max(60),
    defaultValue: 15,
    description: "Default buffer added after a session before the mentor is bookable again.",
  }),
  "scheduling.min_notice_min": defineSetting({
    schema: z.number().int().min(60).max(10_080),
    defaultValue: 720,
    description: "Default minimum notice required before a bookable slot.",
  }),
  "scheduling.max_advance_days": defineSetting({
    schema: z.number().int().min(7).max(90),
    defaultValue: 60,
    description: "Default number of days ahead a mentor can be booked.",
  }),
  "scheduling.max_sessions_per_day": defineSetting({
    schema: z.number().int().min(1).max(12),
    defaultValue: 4,
    description: "Default cap on sessions per mentor-local calendar day.",
  }),
  "service.allowed_durations_min": defineSetting({
    schema: z.array(z.number().int().min(15).max(180)).min(1).max(6),
    defaultValue: [30, 45, 60],
    description: "Session durations mentors may offer without the custom-durations flag.",
  }),
  "booking.max_active_holds_per_student": defineSetting({
    schema: z.number().int().min(1).max(10),
    defaultValue: 3,
    description: "Max simultaneous held (payment-in-progress) bookings per student.",
  }),
  "booking.max_expired_holds_per_day": defineSetting({
    schema: z.number().int().min(1).max(50),
    defaultValue: 5,
    description: "Max holds a student may let expire in a day before booking is throttled.",
  }),
  "booking.max_upcoming_free_1on1_per_student": defineSetting({
    schema: z.number().int().min(1).max(10),
    defaultValue: 2,
    description: "Max upcoming confirmed free 1:1 bookings per student (anti-abuse).",
  }),
  "reschedule.student_self_service_min_hours": defineSetting({
    schema: z.number().int().min(1).max(168),
    defaultValue: 24,
    description: "Hours before start beyond which a student may self-service reschedule once.",
  }),
  "reschedule.max_self_service_per_booking": defineSetting({
    schema: z.number().int().min(0).max(5),
    defaultValue: 1,
    description: "Self-service reschedules allowed per booking before mentor consent is required.",
  }),
  "reschedule.consent_timeout_hours": defineSetting({
    schema: z.number().int().min(1).max(72),
    defaultValue: 12,
    description: "Hours a reschedule request waits for consent before it expires.",
  }),
  "join.window_before_min": defineSetting({
    schema: z.number().int().min(1).max(60),
    defaultValue: 15,
    description: "Minutes before start the session join link becomes active.",
  }),
  "cancellation.student.full_refund_hours": defineSetting({
    schema: z.number().int().min(1).max(168),
    defaultValue: 24,
    description: "Hours before start above which a student cancellation is refunded in full.",
  }),
  "cancellation.student.partial_refund_hours": defineSetting({
    schema: z.number().int().min(0).max(48),
    defaultValue: 6,
    description: "Hours before start above which a student cancellation is refunded partially.",
  }),
  "cancellation.student.partial_refund_pct": defineSetting({
    schema: z.number().int().min(0).max(100),
    defaultValue: 50,
    description: "Refund percentage for a partial-window student cancellation.",
  }),
  "cancellation.student.late_refund_pct": defineSetting({
    schema: z.number().int().min(0).max(100),
    defaultValue: 0,
    description: "Refund percentage for a late student cancellation.",
  }),
  "cancellation.student.courtesy_late_cancels_per_90d": defineSetting({
    schema: z.number().int().min(0).max(5),
    defaultValue: 1,
    description: "Late cancellations per rolling 90 days still refunded at the partial rate.",
  }),
  "cancellation.mentor.refund_pct": defineSetting({
    schema: z.number().int().min(0).max(100),
    defaultValue: 100,
    description: "Refund percentage when a mentor cancels a confirmed booking.",
  }),
  "attendance.checkin_window_min": defineSetting({
    schema: z.object({
      beforeMin: z.number().int().min(0).max(60),
      afterMin: z.number().int().min(0).max(60),
    }),
    defaultValue: { beforeMin: 10, afterMin: 20 },
    description: "Window around start in which a check-in signal may be recorded.",
  }),
  "attendance.no_show_grace_min": defineSetting({
    schema: z.object({
      shortSessionMaxMin: z.number().int().min(1).max(60),
      graceShortMin: z.number().int().min(1).max(60),
      graceOtherMin: z.number().int().min(1).max(60),
    }),
    defaultValue: { shortSessionMaxMin: 30, graceShortMin: 10, graceOtherMin: 15 },
    description: "Earliest a party may claim the other was absent, by session length.",
  }),
  "attendance.finalize_after_end_hours": defineSetting({
    schema: z.number().int().min(0).max(24),
    defaultValue: 2,
    description: "Hours after session end before provisional attendance outcomes are computed.",
  }),
  "attendance.contest_window_hours": defineSetting({
    schema: z.number().int().min(1).max(168),
    defaultValue: 48,
    description: "Hours a provisional no-show outcome may be contested before it finalises.",
  }),
  "attendance.silent_complete_after_end_hours": defineSetting({
    schema: z.number().int().min(1).max(336),
    defaultValue: 72,
    description: "Hours after end a silent (no claims either way) session is marked completed.",
  }),
  "attendance.prompt_after_end_hours": defineSetting({
    schema: z.array(z.number().int().min(1).max(168)).min(1).max(4),
    defaultValue: [1, 24],
    description: "Hours after session end to send 'did your session happen?' prompts.",
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

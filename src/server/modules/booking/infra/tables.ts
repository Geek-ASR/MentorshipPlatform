import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  bigint,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "@/server/modules/auth";
import { mentorProfiles } from "@/server/modules/profiles";
import { appSchema } from "@/server/platform/db/tables/platform";
import { checkIn, tstzrangeColumn } from "@/server/platform/db/sql-helpers";
import {
  ATTENDANCE_CLAIM_OUTCOMES,
  ATTENDANCE_SIGNAL_KINDS,
  BOOKING_STATUSES,
  RESCHEDULE_STATUSES,
  SESSION_KINDS,
  SESSION_STATUSES,
} from "../domain/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const mentorServices = appSchema.table(
  "mentor_services",
  {
    id: uuid("id").primaryKey(),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    kind: text("kind").$type<"one_on_one" | "group" | "event">().notNull().default("one_on_one"),
    title: text("title").notNull(),
    descriptionMd: text("description_md"),
    allowedDurationsMin: integer("allowed_durations_min").array().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    intakeQuestions: jsonb("intake_questions")
      .$type<{ id: string; label: string }[]>()
      .notNull()
      .default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("mentor_services_kind_valid", checkIn("kind", SESSION_KINDS)),
    index("mentor_services_mentor_idx").on(t.mentorUserId),
  ],
);

export const servicePrices = appSchema.table(
  "service_prices",
  {
    id: uuid("id").primaryKey(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => mentorServices.id, { onDelete: "cascade" }),
    durationMin: integer("duration_min").notNull(),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
  },
  (t) => [
    uniqueIndex("service_prices_service_duration_unique").on(t.serviceId, t.durationMin),
    check("service_prices_price_non_negative", sql`${t.priceMinor} >= 0`),
  ],
);

export const schedulingSettings = appSchema.table(
  "scheduling_settings",
  {
    mentorUserId: uuid("mentor_user_id")
      .primaryKey()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    timezone: text("timezone").notNull(),
    slotStepMin: integer("slot_step_min").notNull().default(30),
    bufferAfterMin: integer("buffer_after_min").notNull().default(15),
    minNoticeMin: integer("min_notice_min").notNull().default(720),
    maxAdvanceDays: integer("max_advance_days").notNull().default(60),
    maxSessionsPerDay: integer("max_sessions_per_day").notNull().default(4),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("scheduling_settings_slot_step_valid", sql`${t.slotStepMin} IN (15, 30, 60)`),
    check("scheduling_settings_buffer_valid", sql`${t.bufferAfterMin} BETWEEN 0 AND 60`),
    check("scheduling_settings_min_notice_valid", sql`${t.minNoticeMin} BETWEEN 60 AND 10080`),
    check("scheduling_settings_max_advance_valid", sql`${t.maxAdvanceDays} BETWEEN 7 AND 90`),
    check("scheduling_settings_max_sessions_valid", sql`${t.maxSessionsPerDay} BETWEEN 1 AND 12`),
  ],
);

export const availabilityRules = appSchema.table(
  "availability_rules",
  {
    id: uuid("id").primaryKey(),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startLocal: text("start_local").notNull(),
    endLocal: text("end_local").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [
    check("availability_rules_weekday_valid", sql`${t.weekday} BETWEEN 1 AND 7`),
    check(
      "availability_rules_local_time_format",
      sql`${t.startLocal} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.endLocal} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
    check("availability_rules_time_order", sql`${t.startLocal} < ${t.endLocal}`),
    index("availability_rules_mentor_idx").on(t.mentorUserId),
  ],
);

export const AVAILABILITY_EXCEPTION_KINDS = ["unavailable", "extra_available"] as const;
export type AvailabilityExceptionKind = (typeof AVAILABILITY_EXCEPTION_KINDS)[number];

export const availabilityExceptions = appSchema.table(
  "availability_exceptions",
  {
    id: uuid("id").primaryKey(),
    mentorUserId: uuid("mentor_user_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    kind: text("kind").$type<AvailabilityExceptionKind>().notNull(),
    during: tstzrangeColumn("during").notNull(),
    localSpec: jsonb("local_spec").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    check("availability_exceptions_kind_valid", checkIn("kind", AVAILABILITY_EXCEPTION_KINDS)),
    index("availability_exceptions_mentor_idx").on(t.mentorUserId),
  ],
);

export const sessions = appSchema.table(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<"one_on_one" | "group" | "event">().notNull(),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => mentorProfiles.userId),
    serviceId: uuid("service_id").references(() => mentorServices.id),
    during: tstzrangeColumn("during").notNull(),
    status: text("status")
      .$type<"scheduled" | "cancelled" | "completed" | "under_review">()
      .notNull()
      .default("scheduled"),
    capacity: integer("capacity").notNull().default(1),
    minParticipants: integer("min_participants").notNull().default(1),
    seatPriceMinor: bigint("seat_price_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    registrationClosesAt: timestamp("registration_closes_at", { withTimezone: true }),
    minParticipantsCheckAt: timestamp("min_participants_check_at", { withTimezone: true }),
    meetingProvider: text("meeting_provider"),
    meetingUrl: text("meeting_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("sessions_kind_valid", checkIn("kind", SESSION_KINDS)),
    check("sessions_status_valid", checkIn("status", SESSION_STATUSES)),
    check("sessions_seat_price_non_negative", sql`${t.seatPriceMinor} >= 0`),
    index("sessions_host_idx").on(t.hostUserId),
  ],
);

export const calendarBlocks = appSchema.table(
  "calendar_blocks",
  {
    id: uuid("id").primaryKey(),
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentorProfiles.userId),
    sourceType: text("source_type").$type<"session" | "manual">().notNull(),
    sourceId: uuid("source_id"),
    during: tstzrangeColumn("during").notNull(),
    active: boolean("active").notNull().default(true),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("calendar_blocks_source_type_valid", checkIn("source_type", ["session", "manual"])),
    index("calendar_blocks_mentor_idx").on(t.mentorId),
    index("calendar_blocks_source_idx").on(t.sourceType, t.sourceId),
    // The GiST EXCLUDE constraint that actually prevents double-booking is added by a hand-written
    // follow-up migration (drizzle-kit has no first-class EXCLUDE support, docs/05 §4.1, ADR-027).
  ],
);

export const bookings = appSchema.table(
  "bookings",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    status: text("status").$type<(typeof BOOKING_STATUSES)[number]>().notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    // No FK: `payments.order_items` would have to import this table, but booking's own transaction
    // calls *into* payments to create that row (booking -> payments) — a hard FK the other way would
    // cycle. Both sides store the other's id; they're always written together in one transaction.
    orderItemId: uuid("order_item_id"),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    intakeAnswers: jsonb("intake_answers")
      .$type<{ questionId: string; value: string }[]>()
      .notNull()
      .default([]),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("bookings_status_valid", checkIn("status", BOOKING_STATUSES)),
    check("bookings_price_non_negative", sql`${t.priceMinor} >= 0`),
    index("bookings_session_idx").on(t.sessionId),
    index("bookings_student_idx").on(t.studentId),
    uniqueIndex("bookings_one_active_seat")
      .on(t.sessionId, t.studentId)
      .where(
        sql`status IN ('held','confirmed','completed','no_show_student','no_show_mentor','disputed')`,
      ),
  ],
);

export const rescheduleRequests = appSchema.table(
  "reschedule_requests",
  {
    id: uuid("id").primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").$type<"student" | "mentor">().notNull(),
    proposedDuring: tstzrangeColumn("proposed_during").notNull(),
    status: text("status")
      .$type<(typeof RESCHEDULE_STATUSES)[number]>()
      .notNull()
      .default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    check("reschedule_requests_status_valid", checkIn("status", RESCHEDULE_STATUSES)),
    check("reschedule_requests_requested_by_valid", checkIn("requested_by", ["student", "mentor"])),
    index("reschedule_requests_booking_idx").on(t.bookingId),
  ],
);

export const attendanceSignals = appSchema.table(
  "attendance_signals",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").$type<(typeof ATTENDANCE_SIGNAL_KINDS)[number]>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("attendance_signals_kind_valid", checkIn("kind", ATTENDANCE_SIGNAL_KINDS)),
    index("attendance_signals_session_idx").on(t.sessionId),
  ],
);

export const attendanceClaims = appSchema.table(
  "attendance_claims",
  {
    id: uuid("id").primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    claimantUserId: uuid("claimant_user_id")
      .notNull()
      .references(() => users.id),
    outcome: text("outcome").$type<(typeof ATTENDANCE_CLAIM_OUTCOMES)[number]>().notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    check("attendance_claims_outcome_valid", checkIn("outcome", ATTENDANCE_CLAIM_OUTCOMES)),
    uniqueIndex("attendance_claims_one_per_party").on(t.bookingId, t.claimantUserId),
  ],
);

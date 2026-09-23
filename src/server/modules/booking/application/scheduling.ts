import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { findMentorProfile } from "@/server/modules/profiles";
import { isValidTimeZone } from "../domain/time";
import {
  addAvailabilityException,
  addAvailabilityRule,
  listAvailabilityExceptions,
  listAvailabilityRules,
  findSchedulingSettings,
  removeAvailabilityException,
  removeAvailabilityRule,
  upsertSchedulingSettings,
  type AvailabilityExceptionRow,
  type AvailabilityRuleRow,
  type SchedulingSettingsRow,
} from "../infra/scheduling-repo";
import type { AvailabilityExceptionKind } from "../infra/tables";

async function requireMentor(db: Database, userId: string): Promise<void> {
  const profile = await findMentorProfile(db, userId);
  if (!profile) throw new AppError("BAD_REQUEST", { detail: "Start a mentor application first." });
}

export async function getSchedulingSettings(
  db: Database,
  mentorUserId: string,
  now: Date,
): Promise<SchedulingSettingsRow> {
  const existing = await findSchedulingSettings(db, mentorUserId);
  if (existing) return existing;
  // First read creates sane defaults from the global settings (docs/17 §4) so a mentor with no
  // saved preferences yet still gets a usable, admin-tunable starting point.
  await requireMentor(db, mentorUserId);
  return upsertSchedulingSettings(db, mentorUserId, {
    timezone: "UTC",
    slotStepMin: await getSetting(db, "scheduling.slot_step_min", now),
    bufferAfterMin: await getSetting(db, "scheduling.buffer_after_min", now),
    minNoticeMin: await getSetting(db, "scheduling.min_notice_min", now),
    maxAdvanceDays: await getSetting(db, "scheduling.max_advance_days", now),
    maxSessionsPerDay: await getSetting(db, "scheduling.max_sessions_per_day", now),
  });
}

export async function updateSchedulingSettings(
  db: Database,
  mentorUserId: string,
  patch: Partial<{
    timezone: string;
    slotStepMin: 15 | 30 | 60;
    bufferAfterMin: number;
    minNoticeMin: number;
    maxAdvanceDays: number;
    maxSessionsPerDay: number;
  }>,
  now: Date,
): Promise<SchedulingSettingsRow> {
  await requireMentor(db, mentorUserId);
  if (patch.timezone && !isValidTimeZone(patch.timezone)) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        { path: "timezone", code: "invalid_timezone", message: "Not a recognised IANA time zone." },
      ],
    });
  }
  const current = await getSchedulingSettings(db, mentorUserId, now);
  return upsertSchedulingSettings(db, mentorUserId, { ...current, ...patch });
}

export async function listMentorAvailabilityRules(
  db: Database,
  mentorUserId: string,
): Promise<AvailabilityRuleRow[]> {
  return listAvailabilityRules(db, mentorUserId);
}

export async function addMentorAvailabilityRule(
  db: Database,
  mentorUserId: string,
  input: {
    weekday: number;
    startLocal: string;
    endLocal: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  },
): Promise<AvailabilityRuleRow> {
  await requireMentor(db, mentorUserId);
  if (input.startLocal >= input.endLocal) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "endLocal", code: "order", message: "End time must be after start time." }],
    });
  }
  return addAvailabilityRule(db, { mentorUserId, ...input });
}

export async function removeMentorAvailabilityRule(
  db: Database,
  mentorUserId: string,
  id: string,
): Promise<void> {
  await removeAvailabilityRule(db, mentorUserId, id);
}

export async function listMentorAvailabilityExceptions(
  db: Database,
  mentorUserId: string,
): Promise<AvailabilityExceptionRow[]> {
  return listAvailabilityExceptions(db, mentorUserId);
}

export async function addMentorAvailabilityException(
  db: Database,
  mentorUserId: string,
  input: {
    kind: AvailabilityExceptionKind;
    start: Date;
    end: Date;
    localSpec: Record<string, unknown>;
  },
): Promise<AvailabilityExceptionRow> {
  await requireMentor(db, mentorUserId);
  if (input.start >= input.end) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "end", code: "order", message: "End must be after start." }],
    });
  }
  return addAvailabilityException(db, { mentorUserId, ...input });
}

export async function removeMentorAvailabilityException(
  db: Database,
  mentorUserId: string,
  id: string,
): Promise<void> {
  await removeAvailabilityException(db, mentorUserId, id);
}

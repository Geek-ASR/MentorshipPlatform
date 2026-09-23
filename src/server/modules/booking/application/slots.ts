import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { findMentorProfile } from "@/server/modules/profiles";
import { generateAvailableSlots, type Slot } from "../domain/availability";
import {
  listAvailabilityExceptions,
  listAvailabilityRules,
  findSchedulingSettings,
} from "../infra/scheduling-repo";
import { countSessionsByLocalDate, listActiveBlocksOverlapping } from "../infra/session-repo";
import { findService } from "../infra/service-repo";

export async function getAvailableSlots(
  db: Database,
  input: { mentorUserId: string; serviceId: string; durationMin: number; from: Date; to: Date },
  now: Date,
): Promise<Slot[]> {
  const [mentor, settings, service] = await Promise.all([
    findMentorProfile(db, input.mentorUserId),
    findSchedulingSettings(db, input.mentorUserId),
    findService(db, input.serviceId),
  ]);
  if (!mentor || !settings || !service || service.mentorUserId !== input.mentorUserId) {
    throw new AppError("NOT_FOUND");
  }
  if (!service.allowedDurationsMin.includes(input.durationMin)) {
    throw new AppError("BAD_REQUEST", { detail: "That duration isn't offered for this service." });
  }

  const [rules, exceptions, activeBlocks, sessionCounts] = await Promise.all([
    listAvailabilityRules(db, input.mentorUserId),
    listAvailabilityExceptions(db, input.mentorUserId),
    listActiveBlocksOverlapping(db, input.mentorUserId, input.from, input.to),
    countSessionsByLocalDate(db, input.mentorUserId, settings.timezone, input.from, input.to),
  ]);

  return generateAvailableSlots({
    timeZone: settings.timezone,
    durationMin: input.durationMin,
    slotStepMin: settings.slotStepMin,
    bufferAfterMin: settings.bufferAfterMin,
    minNoticeMin: settings.minNoticeMin,
    maxAdvanceDays: settings.maxAdvanceDays,
    maxSessionsPerDay: settings.maxSessionsPerDay,
    from: input.from,
    to: input.to,
    now,
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startLocal: parseLocalTime(r.startLocal),
      endLocal: parseLocalTime(r.endLocal),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })),
    exceptions: exceptions.map((e) => ({ kind: e.kind, start: e.start, end: e.end })),
    activeBlocks,
    sessionCountByLocalDate: sessionCounts,
  });
}

function parseLocalTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour: hour!, minute: minute! };
}

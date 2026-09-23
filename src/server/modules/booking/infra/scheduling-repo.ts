import { and, asc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { parseTstzRange, toTstzRange } from "@/server/platform/db/sql-helpers";
import { availabilityExceptions, availabilityRules, schedulingSettings } from "./tables";
import type { AvailabilityExceptionKind } from "./tables";

export type SchedulingSettingsRow = typeof schedulingSettings.$inferSelect;

export async function findSchedulingSettings(
  executor: Executor,
  mentorUserId: string,
): Promise<SchedulingSettingsRow | undefined> {
  const [row] = await executor
    .select()
    .from(schedulingSettings)
    .where(eq(schedulingSettings.mentorUserId, mentorUserId))
    .limit(1);
  return row;
}

export async function upsertSchedulingSettings(
  executor: Executor,
  mentorUserId: string,
  values: Partial<
    Pick<
      SchedulingSettingsRow,
      | "timezone"
      | "slotStepMin"
      | "bufferAfterMin"
      | "minNoticeMin"
      | "maxAdvanceDays"
      | "maxSessionsPerDay"
    >
  > & { timezone: string },
): Promise<SchedulingSettingsRow> {
  const [row] = await executor
    .insert(schedulingSettings)
    .values({ mentorUserId, ...values })
    .onConflictDoUpdate({
      target: schedulingSettings.mentorUserId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export type AvailabilityRuleRow = typeof availabilityRules.$inferSelect;

export async function listAvailabilityRules(
  executor: Executor,
  mentorUserId: string,
): Promise<AvailabilityRuleRow[]> {
  return executor
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.mentorUserId, mentorUserId))
    .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startLocal));
}

export async function addAvailabilityRule(
  executor: Executor,
  input: {
    mentorUserId: string;
    weekday: number;
    startLocal: string;
    endLocal: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  },
): Promise<AvailabilityRuleRow> {
  const [row] = await executor
    .insert(availabilityRules)
    .values({ id: newId(), ...input, effectiveTo: input.effectiveTo ?? null })
    .returning();
  return row!;
}

export async function removeAvailabilityRule(
  executor: Executor,
  mentorUserId: string,
  id: string,
): Promise<void> {
  await executor
    .delete(availabilityRules)
    .where(and(eq(availabilityRules.id, id), eq(availabilityRules.mentorUserId, mentorUserId)));
}

export type AvailabilityExceptionRow = {
  id: string;
  mentorUserId: string;
  kind: AvailabilityExceptionKind;
  start: Date;
  end: Date;
  localSpec: Record<string, unknown>;
  createdAt: Date;
};

function toExceptionRow(row: typeof availabilityExceptions.$inferSelect): AvailabilityExceptionRow {
  const { start, end } = parseTstzRange(row.during);
  return {
    id: row.id,
    mentorUserId: row.mentorUserId,
    kind: row.kind,
    start,
    end,
    localSpec: row.localSpec,
    createdAt: row.createdAt,
  };
}

export async function listAvailabilityExceptions(
  executor: Executor,
  mentorUserId: string,
): Promise<AvailabilityExceptionRow[]> {
  const rows = await executor
    .select()
    .from(availabilityExceptions)
    .where(eq(availabilityExceptions.mentorUserId, mentorUserId));
  return rows.map(toExceptionRow);
}

export async function addAvailabilityException(
  executor: Executor,
  input: {
    mentorUserId: string;
    kind: AvailabilityExceptionKind;
    start: Date;
    end: Date;
    localSpec: Record<string, unknown>;
  },
): Promise<AvailabilityExceptionRow> {
  const [row] = await executor
    .insert(availabilityExceptions)
    .values({
      id: newId(),
      mentorUserId: input.mentorUserId,
      kind: input.kind,
      during: toTstzRange(input.start, input.end),
      localSpec: input.localSpec,
    })
    .returning();
  return toExceptionRow(row!);
}

export async function removeAvailabilityException(
  executor: Executor,
  mentorUserId: string,
  id: string,
): Promise<void> {
  await executor
    .delete(availabilityExceptions)
    .where(
      and(eq(availabilityExceptions.id, id), eq(availabilityExceptions.mentorUserId, mentorUserId)),
    );
}

/** Exceptions overlapping [from, to) — the window a slot query or conflict check cares about. */
export async function listExceptionsOverlapping(
  executor: Executor,
  mentorUserId: string,
  from: Date,
  to: Date,
): Promise<AvailabilityExceptionRow[]> {
  const all = await listAvailabilityExceptions(executor, mentorUserId);
  return all.filter((e) => e.start < to && from < e.end);
}

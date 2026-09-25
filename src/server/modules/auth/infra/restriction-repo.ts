import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import type { Capability, Restriction } from "@/server/platform/authz/actor";
import { userRestrictions } from "./tables";

export type UserRestrictionRow = typeof userRestrictions.$inferSelect;

export async function insertRestriction(
  executor: Executor,
  input: {
    userId: string;
    capability: Capability;
    until: Date | null;
    reasonCode: string;
    sourceActionId: string | null;
  },
): Promise<UserRestrictionRow> {
  const [row] = await executor
    .insert(userRestrictions)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

/** Every never-lifted row for a user, filtered to still-active ones in application code (mirrors
 * `activeRestriction()`'s own `until === null || until > now` check) — done in code rather than SQL
 * so `resolveSessionActor` and `activeRestriction` share exactly one definition of "active." */
export async function listRestrictionRowsForUser(
  executor: Executor,
  userId: string,
): Promise<UserRestrictionRow[]> {
  return executor
    .select()
    .from(userRestrictions)
    .where(and(eq(userRestrictions.userId, userId), isNull(userRestrictions.liftedAt)));
}

export function toActiveRestrictions(
  rows: readonly UserRestrictionRow[],
  now: Date,
): Restriction[] {
  return rows
    .filter((row) => row.until === null || row.until > now)
    .map((row) => ({ capability: row.capability as Capability, until: row.until }));
}

/** Live check for a *different* user's restriction (e.g. a mentor's `booking.accept` while the
 * requesting actor is the student) — `activeRestriction()` only ever sees the requester's own actor,
 * so a check against someone else needs a direct query. */
export async function hasActiveRestriction(
  executor: Executor,
  userId: string,
  capability: Capability,
  now: Date,
): Promise<boolean> {
  const rows = await listRestrictionRowsForUser(executor, userId);
  return toActiveRestrictions(rows, now).some((r) => r.capability === capability);
}

export async function liftRestriction(executor: Executor, id: string, now: Date): Promise<void> {
  await executor.update(userRestrictions).set({ liftedAt: now }).where(eq(userRestrictions.id, id));
}

export async function liftAllRestrictionsFromAction(
  executor: Executor,
  sourceActionId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(userRestrictions)
    .set({ liftedAt: now })
    .where(
      and(eq(userRestrictions.sourceActionId, sourceActionId), isNull(userRestrictions.liftedAt)),
    );
}

/** `reinstate` (docs/10 §7.3 "lifts restrictions") clears every currently-active restriction for the
 * subject, not just the one from a single prior action — the intent of reinstating someone is "back
 * in good standing," not "undo one specific decision" (that narrower case is what `appeals`
 * overturning one action already handles via `liftAllRestrictionsFromAction`). */
export async function liftAllActiveRestrictionsForUser(
  executor: Executor,
  userId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(userRestrictions)
    .set({ liftedAt: now })
    .where(and(eq(userRestrictions.userId, userId), isNull(userRestrictions.liftedAt)));
}

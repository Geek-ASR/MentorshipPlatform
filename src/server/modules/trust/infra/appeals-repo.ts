import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { appeals } from "./tables";
import type { AppealStatus } from "../domain/types";

export type AppealRow = typeof appeals.$inferSelect;

export async function insertAppeal(
  executor: Executor,
  input: { moderationActionId: string; appellantUserId: string; statement: string },
): Promise<AppealRow> {
  const [row] = await executor
    .insert(appeals)
    .values({ id: newId(), status: "open", reviewerId: null, singleStaffReview: false, ...input })
    .returning();
  return row!;
}

export async function findAppeal(executor: Executor, id: string): Promise<AppealRow | undefined> {
  const [row] = await executor.select().from(appeals).where(eq(appeals.id, id)).limit(1);
  return row;
}

export async function findAppealForAction(
  executor: Executor,
  moderationActionId: string,
): Promise<AppealRow | undefined> {
  const [row] = await executor
    .select()
    .from(appeals)
    .where(eq(appeals.moderationActionId, moderationActionId))
    .limit(1);
  return row;
}

export async function decideAppeal(
  executor: Executor,
  id: string,
  input: { status: AppealStatus; reviewerId: string; singleStaffReview: boolean; now: Date },
): Promise<AppealRow | undefined> {
  const [row] = await executor
    .update(appeals)
    .set({
      status: input.status,
      reviewerId: input.reviewerId,
      singleStaffReview: input.singleStaffReview,
      decidedAt: input.now,
    })
    .where(eq(appeals.id, id))
    .returning();
  return row;
}

export async function listOpenAppeals(executor: Executor): Promise<AppealRow[]> {
  return executor.select().from(appeals).where(eq(appeals.status, "open"));
}

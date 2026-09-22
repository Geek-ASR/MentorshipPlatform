import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { mentorAffiliations, type AffiliationKind } from "./tables";

export type MentorAffiliationRow = typeof mentorAffiliations.$inferSelect;

export type NewAffiliation = {
  mentorUserId: string;
  kind: AffiliationKind;
  universityId?: string | null;
  companyId?: string | null;
  programId?: string | null;
  title: string;
  isCurrent: boolean;
  startDate?: string | null;
  endDate?: string | null;
};

export async function addAffiliation(
  executor: Executor,
  input: NewAffiliation,
): Promise<MentorAffiliationRow> {
  const [row] = await executor
    .insert(mentorAffiliations)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function listAffiliations(
  executor: Executor,
  mentorUserId: string,
): Promise<MentorAffiliationRow[]> {
  return executor
    .select()
    .from(mentorAffiliations)
    .where(eq(mentorAffiliations.mentorUserId, mentorUserId));
}

export async function findAffiliation(
  executor: Executor,
  id: string,
): Promise<MentorAffiliationRow | undefined> {
  const [row] = await executor
    .select()
    .from(mentorAffiliations)
    .where(eq(mentorAffiliations.id, id))
    .limit(1);
  return row;
}

export async function removeAffiliation(
  executor: Executor,
  id: string,
  mentorUserId: string,
): Promise<void> {
  await executor
    .delete(mentorAffiliations)
    .where(and(eq(mentorAffiliations.id, id), eq(mentorAffiliations.mentorUserId, mentorUserId)));
}

import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import {
  mentorExpertise,
  mentorLanguages,
  mentorLinks,
  type LanguageProficiency,
  type MentorLinkKind,
} from "./tables";

export async function setExpertise(
  executor: Executor,
  mentorUserId: string,
  termIds: string[],
): Promise<void> {
  await executor.delete(mentorExpertise).where(eq(mentorExpertise.mentorUserId, mentorUserId));
  if (termIds.length === 0) return;
  await executor
    .insert(mentorExpertise)
    .values(termIds.map((termId) => ({ mentorUserId, termId })));
}

export async function listExpertise(executor: Executor, mentorUserId: string): Promise<string[]> {
  const rows = await executor
    .select({ termId: mentorExpertise.termId })
    .from(mentorExpertise)
    .where(eq(mentorExpertise.mentorUserId, mentorUserId));
  return rows.map((r) => r.termId);
}

export type LanguageInput = { termId: string; proficiency: LanguageProficiency };

export async function setLanguages(
  executor: Executor,
  mentorUserId: string,
  languages: LanguageInput[],
): Promise<void> {
  await executor.delete(mentorLanguages).where(eq(mentorLanguages.mentorUserId, mentorUserId));
  if (languages.length === 0) return;
  await executor
    .insert(mentorLanguages)
    .values(languages.map((l) => ({ mentorUserId, termId: l.termId, proficiency: l.proficiency })));
}

export async function listLanguages(
  executor: Executor,
  mentorUserId: string,
): Promise<{ termId: string; proficiency: LanguageProficiency }[]> {
  return executor
    .select({ termId: mentorLanguages.termId, proficiency: mentorLanguages.proficiency })
    .from(mentorLanguages)
    .where(eq(mentorLanguages.mentorUserId, mentorUserId));
}

export type MentorLinkRow = typeof mentorLinks.$inferSelect;

export async function addLink(
  executor: Executor,
  mentorUserId: string,
  kind: MentorLinkKind,
  url: string,
): Promise<MentorLinkRow> {
  const [row] = await executor
    .insert(mentorLinks)
    .values({ id: newId(), mentorUserId, kind, url })
    .returning();
  return row!;
}

export async function listLinks(
  executor: Executor,
  mentorUserId: string,
): Promise<MentorLinkRow[]> {
  return executor.select().from(mentorLinks).where(eq(mentorLinks.mentorUserId, mentorUserId));
}

export async function removeLink(
  executor: Executor,
  id: string,
  mentorUserId: string,
): Promise<void> {
  await executor
    .delete(mentorLinks)
    .where(and(eq(mentorLinks.id, id), eq(mentorLinks.mentorUserId, mentorUserId)));
}

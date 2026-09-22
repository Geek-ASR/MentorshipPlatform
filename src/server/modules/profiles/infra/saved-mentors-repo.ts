import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { savedMentors } from "./tables";

export async function saveMentor(
  executor: Executor,
  studentUserId: string,
  mentorUserId: string,
): Promise<void> {
  await executor
    .insert(savedMentors)
    .values({ studentUserId, mentorUserId })
    .onConflictDoNothing({ target: [savedMentors.studentUserId, savedMentors.mentorUserId] });
}

export async function unsaveMentor(
  executor: Executor,
  studentUserId: string,
  mentorUserId: string,
): Promise<void> {
  await executor
    .delete(savedMentors)
    .where(
      and(
        eq(savedMentors.studentUserId, studentUserId),
        eq(savedMentors.mentorUserId, mentorUserId),
      ),
    );
}

export async function listSavedMentorIds(
  executor: Executor,
  studentUserId: string,
): Promise<string[]> {
  const rows = await executor
    .select({ mentorUserId: savedMentors.mentorUserId })
    .from(savedMentors)
    .where(eq(savedMentors.studentUserId, studentUserId));
  return rows.map((r) => r.mentorUserId);
}

export async function isSaved(
  executor: Executor,
  studentUserId: string,
  mentorUserId: string,
): Promise<boolean> {
  const [row] = await executor
    .select({ mentorUserId: savedMentors.mentorUserId })
    .from(savedMentors)
    .where(
      and(
        eq(savedMentors.studentUserId, studentUserId),
        eq(savedMentors.mentorUserId, mentorUserId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

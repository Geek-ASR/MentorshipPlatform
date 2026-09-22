import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { studentProfiles, type StudentVisibility } from "./tables";

export type StudentProfileRow = typeof studentProfiles.$inferSelect;

export async function findStudentProfile(
  executor: Executor,
  userId: string,
): Promise<StudentProfileRow | undefined> {
  const [row] = await executor
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  return row;
}

export type StudentProfileInput = {
  visibility?: StudentVisibility;
  headline?: string | null;
  bioMd?: string | null;
};

export async function upsertStudentProfile(
  executor: Executor,
  userId: string,
  input: StudentProfileInput,
): Promise<StudentProfileRow> {
  const [row] = await executor
    .insert(studentProfiles)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: studentProfiles.userId, set: input })
    .returning();
  return row!;
}

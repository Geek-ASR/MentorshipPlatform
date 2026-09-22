import type { Database } from "@/server/platform/db/client";
import {
  findStudentProfile,
  upsertStudentProfile,
  type StudentProfileInput,
} from "../infra/student-repo";

export async function saveStudentProfile(
  db: Database,
  userId: string,
  input: StudentProfileInput,
): Promise<void> {
  await upsertStudentProfile(db, userId, input);
}

export async function getStudentProfile(db: Database, userId: string) {
  return findStudentProfile(db, userId);
}

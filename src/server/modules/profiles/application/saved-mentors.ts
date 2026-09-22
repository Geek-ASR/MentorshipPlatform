import type { Database } from "@/server/platform/db/client";
import { isSaved, listSavedMentorIds, saveMentor, unsaveMentor } from "../infra/saved-mentors-repo";
import { findMentorProfile } from "../infra/mentor-repo";
import { AppError } from "@/server/platform/errors";

export async function toggleSavedMentor(
  db: Database,
  studentUserId: string,
  mentorUserId: string,
  save: boolean,
): Promise<void> {
  const mentor = await findMentorProfile(db, mentorUserId);
  if (!mentor) throw new AppError("NOT_FOUND");
  if (save) await saveMentor(db, studentUserId, mentorUserId);
  else await unsaveMentor(db, studentUserId, mentorUserId);
}

export async function getSavedMentorIds(db: Database, studentUserId: string): Promise<string[]> {
  return listSavedMentorIds(db, studentUserId);
}

export async function checkIsSaved(
  db: Database,
  studentUserId: string,
  mentorUserId: string,
): Promise<boolean> {
  return isSaved(db, studentUserId, mentorUserId);
}

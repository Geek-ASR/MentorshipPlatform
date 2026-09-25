import { desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { mentorProfiles, type MentorApplicationStatus, type PayoutMode } from "./tables";

export type MentorProfileRow = typeof mentorProfiles.$inferSelect;

export async function findMentorProfile(
  executor: Executor,
  userId: string,
): Promise<MentorProfileRow | undefined> {
  const [row] = await executor
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, userId))
    .limit(1);
  return row;
}

export async function findMentorProfileBySlug(
  executor: Executor,
  slug: string,
): Promise<MentorProfileRow | undefined> {
  const [row] = await executor
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.slug, slug))
    .limit(1);
  return row;
}

/** docs/06 §7.9 `GET /admin/mentor-applications` — defaults to the review queue (`submitted`). */
export async function listMentorApplicationsForAdmin(
  executor: Executor,
  options: { status?: MentorApplicationStatus; limit?: number } = {},
): Promise<MentorProfileRow[]> {
  const status = options.status ?? "submitted";
  return executor
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.applicationStatus, status))
    .orderBy(desc(mentorProfiles.submittedAt))
    .limit(options.limit ?? 50);
}

export async function slugTaken(executor: Executor, slug: string): Promise<boolean> {
  const [row] = await executor
    .select({ userId: mentorProfiles.userId })
    .from(mentorProfiles)
    .where(eq(mentorProfiles.slug, slug))
    .limit(1);
  return row !== undefined;
}

/** Starts (or returns) the draft mentor profile for a user — the first step of docs/01 J2. */
export async function startMentorDraft(
  executor: Executor,
  userId: string,
  slug: string,
): Promise<MentorProfileRow> {
  const [row] = await executor
    .insert(mentorProfiles)
    .values({ userId, slug })
    .onConflictDoNothing({ target: mentorProfiles.userId })
    .returning();
  if (row) return row;
  return (await findMentorProfile(executor, userId))!;
}

export type MentorProfileEdit = { headline?: string; bioMd?: string };

export async function updateMentorProfileContent(
  executor: Executor,
  userId: string,
  input: MentorProfileEdit,
): Promise<void> {
  await executor.update(mentorProfiles).set(input).where(eq(mentorProfiles.userId, userId));
}

export async function setSearchIndexable(
  executor: Executor,
  userId: string,
  searchIndexable: boolean,
): Promise<void> {
  await executor
    .update(mentorProfiles)
    .set({ searchIndexable })
    .where(eq(mentorProfiles.userId, userId));
}

export async function submitMentorApplication(
  executor: Executor,
  userId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(mentorProfiles)
    .set({ applicationStatus: "submitted", submittedAt: now })
    .where(eq(mentorProfiles.userId, userId));
}

export async function decideMentorApplication(
  executor: Executor,
  userId: string,
  decision: {
    status: Extract<MentorApplicationStatus, "approved" | "rejected" | "paused">;
    reviewedBy: string;
    now: Date;
    rejectionReason?: string;
  },
): Promise<void> {
  await executor
    .update(mentorProfiles)
    .set({
      applicationStatus: decision.status,
      reviewedBy: decision.reviewedBy,
      approvedAt: decision.status === "approved" ? decision.now : undefined,
      rejectedAt: decision.status === "rejected" ? decision.now : undefined,
      rejectionReason: decision.status === "rejected" ? decision.rejectionReason : null,
    })
    .where(eq(mentorProfiles.userId, userId));
}

export async function setListingState(
  executor: Executor,
  userId: string,
  isListed: boolean,
  activeCredentialCount: number,
): Promise<void> {
  await executor
    .update(mentorProfiles)
    .set({ isListed, activeCredentialCount })
    .where(eq(mentorProfiles.userId, userId));
}

export async function setPayoutMode(
  executor: Executor,
  userId: string,
  payoutMode: PayoutMode,
): Promise<void> {
  await executor
    .update(mentorProfiles)
    .set({ payoutMode })
    .where(eq(mentorProfiles.userId, userId));
}

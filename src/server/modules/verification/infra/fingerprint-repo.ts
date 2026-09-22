import { eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { verifiedEmailFingerprints } from "./tables";

export async function findFingerprintOwner(
  executor: Executor,
  emailHash: string,
): Promise<string | undefined> {
  const [row] = await executor
    .select({ userId: verifiedEmailFingerprints.userId })
    .from(verifiedEmailFingerprints)
    .where(eq(verifiedEmailFingerprints.emailHash, emailHash))
    .limit(1);
  return row?.userId;
}

/** Records "this email address has now been proven, by this user" — first one wins (docs/10 §2.2). */
export async function recordFingerprint(
  executor: Executor,
  emailHash: string,
  userId: string,
): Promise<void> {
  await executor
    .insert(verifiedEmailFingerprints)
    .values({ emailHash, userId })
    .onConflictDoNothing({
      target: verifiedEmailFingerprints.emailHash,
    });
}

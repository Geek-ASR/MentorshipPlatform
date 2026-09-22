import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { refreshListingFromCredentials } from "@/server/modules/profiles";
import {
  countActiveCredentials,
  listCredentialsForUser,
  revokeCredential,
  type CredentialRow,
} from "../infra/credential-repo";

export async function listCredentials(db: Database, userId: string): Promise<CredentialRow[]> {
  return listCredentialsForUser(db, userId);
}

/** Staff revocation (docs/10 §2.2: contrary evidence / affiliation edited / fraud case). */
export async function revokeCredentialAsStaff(
  db: Database,
  staffUserId: string,
  credentialId: string,
  mentorUserId: string,
  reason: string,
  clock: Clock,
): Promise<void> {
  if (reason.trim().length < 3) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "reason", code: "too_small", message: "A reason is required." }],
    });
  }
  const now = clock.now();
  await db.transaction(async (tx) => {
    await revokeCredential(tx, credentialId);
    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: staffUserId,
      action: "verification.credential_revoked",
      targetType: "credential",
      targetId: credentialId,
      metadata: { reason, mentorUserId },
    });
  });
  const activeCount = await countActiveCredentials(db, mentorUserId, now);
  await refreshListingFromCredentials(db, mentorUserId, activeCount);
}

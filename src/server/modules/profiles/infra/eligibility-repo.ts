import { desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { mentorEligibilityAttestations, type PayoutMode, type ResidencyStatus } from "./tables";

export type AttestationRow = typeof mentorEligibilityAttestations.$inferSelect;

export async function insertAttestation(
  executor: Executor,
  input: {
    mentorUserId: string;
    countryIso2: string;
    residencyStatus: ResidencyStatus;
    payoutModeResult: PayoutMode;
    attestedAt: Date;
    expiresAt: Date;
  },
): Promise<AttestationRow> {
  const [row] = await executor
    .insert(mentorEligibilityAttestations)
    .values({ id: newId(), ...input })
    .returning();
  return row!;
}

export async function latestAttestation(
  executor: Executor,
  mentorUserId: string,
): Promise<AttestationRow | undefined> {
  const [row] = await executor
    .select()
    .from(mentorEligibilityAttestations)
    .where(eq(mentorEligibilityAttestations.mentorUserId, mentorUserId))
    .orderBy(desc(mentorEligibilityAttestations.attestedAt))
    .limit(1);
  return row;
}

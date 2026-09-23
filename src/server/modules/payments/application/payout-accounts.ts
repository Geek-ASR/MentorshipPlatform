import type { Executor } from "@/server/platform/db/client";
import { writeAudit } from "@/server/platform/audit";
import type { PaymentGateway } from "./ports";
import { upsertPayoutAccount, type PayoutAccountRow } from "../infra/payout-accounts-repo";

/**
 * Onboards a mentor's payout account (docs/19 Phase 8 scope: "payout accounts (fake onboarding)").
 * Fake auto-approves; a real Razorpay Route adapter would return `pending` until KYC completes,
 * with the account activated later by an `account.activated` webhook — out of scope this phase
 * since there's no live adapter to receive that webhook from (docs/19 Phase 8 deviations).
 */
export async function onboardMentorPayoutAccount(
  executor: Executor,
  gateway: PaymentGateway,
  mentorUserId: string,
): Promise<PayoutAccountRow> {
  const linked = await gateway.createLinkedAccount({ mentorUserId });
  const row = await upsertPayoutAccount(executor, {
    mentorUserId,
    provider: gateway.provider,
    providerAccountId: linked.providerAccountId,
    status: "active",
  });
  await writeAudit(executor, {
    actorType: "user",
    actorUserId: mentorUserId,
    action: "payout_account.onboarded",
    targetType: "payout_account",
    targetId: row.id,
  });
  return row;
}

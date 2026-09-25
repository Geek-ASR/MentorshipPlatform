import type { Database } from "@/server/platform/db/client";
import { canTransitionIntent, transitionIntent } from "../domain/state-machines";
import { createFakeGateway, type FakeGatewayChaos } from "../infra/fake-gateway";
import { listExpiredPendingIntents, transitionPaymentIntent } from "../infra/payment-intents-repo";
import { applyVerifiedCapture } from "./apply-capture";

export type SweepResult = { checked: number; captured: number; expired: number; failed: number };

/**
 * The payment sweeper (docs/08 §10, §11 "Payment initiated, student closes browser"): for every
 * `pending` intent whose hold has lapsed, re-fetch the provider directly instead of waiting on a
 * webhook that may have been missed or delayed — the same recovery path a delayed webhook takes
 * (`applyVerifiedCapture`), so a client that never got a confirmation still ends up confirmed.
 *
 * Each intent is swept in isolation: a provider timeout/outage on one intent's `fetchPaymentStatus`
 * call is logged and skipped rather than aborting the whole batch, since this job runs on a fixed
 * schedule (docs/19 Phase 8) and `listExpiredPendingIntents` re-selects every still-`pending` intent
 * on the next tick — a skipped intent is naturally retried, not lost (Phase 13 chaos-test finding).
 */
export async function sweepExpiredPaymentIntents(
  db: Database,
  now: Date,
  gatewayChaos?: FakeGatewayChaos,
): Promise<SweepResult> {
  const gateway = createFakeGateway(db, gatewayChaos);
  const intents = await listExpiredPendingIntents(db, now);
  const result: SweepResult = { checked: intents.length, captured: 0, expired: 0, failed: 0 };

  for (const intent of intents) {
    try {
      const authoritative = await gateway.fetchPaymentStatus(intent.providerOrderId);
      if (
        authoritative.status === "captured" &&
        authoritative.providerPaymentId &&
        authoritative.amountMinor !== null
      ) {
        await applyVerifiedCapture(
          db,
          gateway,
          intent,
          {
            providerPaymentId: authoritative.providerPaymentId,
            amountMinor: authoritative.amountMinor,
            currency: intent.currency,
          },
          now,
        );
        result.captured += 1;
      } else if (canTransitionIntent(intent.status, "hold_expired_no_capture")) {
        await transitionPaymentIntent(
          db,
          intent.id,
          intent.version,
          transitionIntent(intent.status, "hold_expired_no_capture"),
          now,
        );
        result.expired += 1;
      }
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

import type { Executor, Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import type { PaymentGateway } from "./ports";
import { transferReleasedJournal } from "../domain/ledger";
import { canTransitionTransfer, transitionTransfer } from "../domain/state-machines";
import { findPayoutAccount, findPayoutAccountById } from "../infra/payout-accounts-repo";
import { findOrderItem } from "../infra/orders-repo";
import {
  findTransfer,
  findTransferByOrderItem,
  insertTransfer,
  listReleasableTransfers,
  setTransferHoldUntil,
  setTransferStatus,
} from "../infra/transfers-repo";
import { postJournal } from "../infra/ledger-repo";
import type { TransferRow } from "../infra/transfers-repo";

/** Creates the mentor's `on_hold` transfer right after capture (docs/08 §5.4). The payout account
 * must already be `active` — `evaluateBookingEligibility` (booking module) guaranteed that before
 * the booking was ever payable, so this never has to handle a missing/inactive account. */
export async function createTransferForOrderItem(
  executor: Executor,
  gateway: PaymentGateway,
  orderItemId: string,
  mentorUserId: string,
  now: Date,
): Promise<TransferRow> {
  const existing = await findTransferByOrderItem(executor, orderItemId);
  if (existing) return existing;

  const orderItem = await findOrderItem(executor, orderItemId);
  if (!orderItem) throw new Error(`order_item ${orderItemId} not found`);
  const payoutAccount = await findPayoutAccount(executor, mentorUserId);
  if (!payoutAccount || payoutAccount.status !== "active") {
    throw new Error(`mentor ${mentorUserId} has no active payout account for transfer creation`);
  }

  const holdAfterEndHours = await getSetting(executor, "payout.hold_after_end_hours", now);
  const providerTransfer = await gateway.createTransfer({
    providerAccountId: payoutAccount.providerAccountId ?? payoutAccount.id,
    amountMinor: orderItem.mentorShareMinor,
    currency: orderItem.currency,
  });
  return insertTransfer(executor, {
    orderItemId,
    payoutAccountId: payoutAccount.id,
    provider: gateway.provider,
    providerTransferId: providerTransfer.providerTransferId,
    amountMinor: orderItem.mentorShareMinor,
    currency: orderItem.currency,
    holdUntil: new Date(now.getTime() + holdAfterEndHours * 3_600_000),
  });
}

/** Recurring job: releases every `on_hold` transfer whose hold has elapsed (docs/08 §10). */
export async function releaseEligibleTransfers(
  db: Database,
  gateway: PaymentGateway,
  now: Date,
): Promise<number> {
  const releasable = await listReleasableTransfers(db, now);
  let released = 0;
  for (const transfer of releasable) {
    if (!canTransitionTransfer(transfer.status, "hold_elapsed_clear")) continue;
    await db.transaction(async (tx) => {
      const fresh = await findTransferByOrderItem(tx, transfer.orderItemId);
      if (!fresh || fresh.status !== "on_hold") return;
      if (transfer.providerTransferId) await gateway.releaseTransfer(transfer.providerTransferId);
      const to = transitionTransfer(fresh.status, "hold_elapsed_clear");
      await setTransferStatus(tx, fresh.id, to, now);
      const payoutAccount = await findPayoutAccountById(tx, fresh.payoutAccountId);
      if (!payoutAccount) return;
      await postJournal(
        tx,
        transferReleasedJournal({
          idempotencyKey: `transfer-released:${fresh.id}`,
          mentorUserId: payoutAccount.mentorUserId,
          currency: fresh.currency,
          amountMinor: fresh.amountMinor,
        }),
      );
    });
    released += 1;
  }
  return released;
}

const FAR_FUTURE_HOLD = new Date("2099-01-01T00:00:00.000Z");

/** Admin manual hold (docs/06 §7.9 `POST /admin/transfers/{id}/hold`) — pushes the release date far
 * out rather than introducing a distinct "administratively held" status; releasing clears it. */
export async function adminHoldTransfer(
  executor: Executor,
  actorUserId: string,
  transferId: string,
  reason: string,
): Promise<TransferRow> {
  const transfer = await findTransfer(executor, transferId);
  if (!transfer) throw new AppError("NOT_FOUND");
  if (transfer.status !== "on_hold") {
    throw new AppError("INVALID_STATE_TRANSITION", {
      detail: "Only an on-hold transfer can be held further.",
    });
  }
  await setTransferHoldUntil(executor, transferId, FAR_FUTURE_HOLD);
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "transfer.admin_hold",
    targetType: "transfer",
    targetId: transferId,
    metadata: { reason },
  });
  return { ...transfer, holdUntil: FAR_FUTURE_HOLD };
}

/** Admin manual release (docs/06 §7.9 `POST /admin/transfers/{id}/release`) — same effect as the
 * releaser job reaching this transfer's `hold_until`, just triggered immediately. */
export async function adminReleaseTransfer(
  executor: Executor,
  gateway: PaymentGateway,
  actorUserId: string,
  transferId: string,
  now: Date,
): Promise<TransferRow> {
  const transfer = await findTransfer(executor, transferId);
  if (!transfer) throw new AppError("NOT_FOUND");
  if (!canTransitionTransfer(transfer.status, "hold_elapsed_clear")) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      detail: "This transfer isn't releasable right now.",
    });
  }
  if (transfer.providerTransferId) await gateway.releaseTransfer(transfer.providerTransferId);
  const to = transitionTransfer(transfer.status, "hold_elapsed_clear");
  const updated = await setTransferStatus(executor, transferId, to, now);
  const payoutAccount = await findPayoutAccountById(executor, transfer.payoutAccountId);
  if (payoutAccount) {
    await postJournal(
      executor,
      transferReleasedJournal({
        idempotencyKey: `transfer-released:${transferId}`,
        mentorUserId: payoutAccount.mentorUserId,
        currency: transfer.currency,
        amountMinor: transfer.amountMinor,
      }),
    );
  }
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "transfer.admin_release",
    targetType: "transfer",
    targetId: transferId,
  });
  return updated ?? transfer;
}

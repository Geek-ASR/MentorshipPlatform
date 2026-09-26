import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import type { AppealStatus } from "../domain/types";
import { APPEAL_WINDOW_DAYS, isWithinAppealWindow } from "../domain/appeal-window";
import {
  decideAppeal as decideAppealRow,
  findAppeal,
  findAppealForAction,
  insertAppeal,
  listOpenAppeals,
  type AppealRow,
} from "../infra/appeals-repo";
import { findAction } from "../infra/moderation-repo";
import { reverseModerationAction } from "./enforcement";

/** docs/10 §7.4: one appeal per action. */
export async function openAppeal(
  db: Database,
  appellantUserId: string,
  moderationActionId: string,
  statement: string,
  now: Date,
): Promise<AppealRow> {
  const action = await findAction(db, moderationActionId);
  if (!action) throw new AppError("NOT_FOUND");
  if (action.subjectUserId !== appellantUserId) throw new AppError("FORBIDDEN");
  if (action.action === "reinstate") {
    throw new AppError("INVALID_STATE_TRANSITION", {
      detail: "A reinstatement lifts restrictions — there's nothing to appeal.",
    });
  }
  if (!isWithinAppealWindow(action.createdAt, now)) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      detail: `Appeals must be made within ${APPEAL_WINDOW_DAYS} days of the decision.`,
    });
  }

  const existing = await findAppealForAction(db, moderationActionId);
  if (existing) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      detail: "This action has already been appealed.",
    });
  }

  const appeal = await insertAppeal(db, { moderationActionId, appellantUserId, statement });
  await writeAudit(db, {
    actorType: "user",
    actorUserId: appellantUserId,
    action: "trust.appeal_opened",
    targetType: "moderation_action",
    targetId: moderationActionId,
    metadata: { appealId: appeal.id },
  });
  return appeal;
}

export async function listAppealsForReview(db: Database): Promise<AppealRow[]> {
  return listOpenAppeals(db);
}

export type DecideAppealInput = {
  appealId: string;
  status: Exclude<AppealStatus, "open">;
  reviewerId: string;
  note: string | null;
};

/**
 * Decides an appeal (docs/10 §7.4). `overturned` walks back the original action's effects entirely
 * — lifts every restriction it caused and, for suspend/ban, reinstates the account — and excuses
 * exactly the trust events that triggered it (`restrictionScope.contributingEventIds`, captured by
 * the policy evaluator at trigger time — see `domain/policy-evaluator.ts`) so a future policy-engine
 * run doesn't re-count them. A manually-decided action carries no contributing events to excuse.
 * `modified`/`upheld` change nothing about already-applied effects — a `modified` decision that
 * should reduce a restriction's scope is a fresh manual action a staff member applies separately via
 * `decideCase`, not an implicit side effect of this function.
 */
export async function decideAppeal(
  db: Database,
  input: DecideAppealInput,
  now: Date,
): Promise<AppealRow> {
  return db.transaction(async (tx) => {
    const appeal = await findAppeal(tx, input.appealId);
    if (!appeal) throw new AppError("NOT_FOUND");
    if (appeal.status !== "open") {
      throw new AppError("INVALID_STATE_TRANSITION", {
        detail: "This appeal was already decided.",
      });
    }
    const action = await findAction(tx, appeal.moderationActionId);
    if (!action) throw new AppError("NOT_FOUND");

    const singleStaffReview = action.decidedBy === input.reviewerId;
    const updated = await decideAppealRow(tx, input.appealId, {
      status: input.status,
      reviewerId: input.reviewerId,
      singleStaffReview,
      now,
    });
    if (!updated) throw new AppError("NOT_FOUND");

    if (input.status === "overturned") {
      await reverseModerationAction(tx, action, now, `appeal_overturned:${input.appealId}`);
    }

    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: input.reviewerId,
      action: "trust.appeal_decided",
      targetType: "moderation_action",
      targetId: action.id,
      metadata: {
        appealId: input.appealId,
        status: input.status,
        note: input.note,
        singleStaffReview,
      },
    });

    return updated;
  });
}

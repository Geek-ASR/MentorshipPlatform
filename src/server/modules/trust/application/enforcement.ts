import type { Executor } from "@/server/platform/db/client";
import { writeAudit } from "@/server/platform/audit";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import type { Capability } from "@/server/platform/authz/actor";
import {
  findUserById,
  insertRestriction,
  liftAllActiveRestrictionsForUser,
  revokeAllSessionsForUser,
  sendAuthEmail,
  updateUserStatus,
} from "@/server/modules/auth";
import { refreshMentorListing } from "@/server/modules/profiles";
import type { ModerationActionType } from "../domain/types";
import { insertAction, type ModerationActionRow } from "../infra/moderation-repo";
import { excuseTrustEvent } from "../infra/trust-events-repo";

/** docs/10 §7.3's `notifyTemplate` intent, reduced to one line per action type — this phase doesn't
 * build a full templating system (documented deviation), just enough that every action tells the
 * subject what happened and why. */
const ACTION_NOTIFICATION_SUBJECTS: Record<ModerationActionType, string> = {
  warn: "You've received a warning",
  restrict: "A restriction was placed on your account",
  suspend: "Your account has been suspended",
  ban: "Your account has been banned",
  reinstate: "Your account has been reinstated",
  remove_content: "Content was removed from your account",
  hide_profile: "Your mentor profile was hidden",
};

export type ApplyActionInput = {
  subjectUserId: string;
  action: ModerationActionType;
  restrictions: Capability[];
  durationDays: number | null;
  reasonCode: string;
  rationale: string | null;
  caseId: string | null;
  decidedBy: string | null;
  secondReviewerId: string | null;
  /** The specific trust-event ids that triggered this action, when it came from the policy engine
   * (empty for a manual staff decision) — stored so an overturned appeal can excuse exactly these
   * events (see `appeals.ts`) rather than every event ever recorded for the subject. */
  contributingEventIds?: string[];
};

/**
 * Materialises a moderation action's real effects (docs/10 §7.3) — every action produces an audit
 * entry, a `moderation_actions` row and derived `user_restrictions` rows `authorize()` already
 * checks (docs/10 §7.3 "derived `user_restrictions` rows checked centrally by authorize()"). Callers
 * are both the auto-apply path (policy engine, `warn`/`restrict` only) and the manual staff-decision
 * path (any of the seven actions) — this function itself doesn't re-check the auto-only-low-severity
 * invariant; that's the *policy evaluator's* job (docs/19 Phase 10 exit criterion) before a proposal
 * ever reaches here as `autoApply: true`.
 *
 * Deliberately does NOT cancel the subject's existing confirmed bookings on `suspend`/`ban`, despite
 * docs/10 §7.3 naming that as part of the action's effect — booking has no staff-initiated cancel
 * path yet (only student/mentor self-cancel, docs/09), and building one is out of this already-large
 * phase's scope (documented deviation, docs/19 Phase 10 retrospective). The restriction/suspension
 * itself still takes effect immediately: `booking.accept`/`booking.create` block every *new* booking
 * attempt from the moment this function returns.
 */
export async function applyModerationAction(
  executor: Executor,
  input: ApplyActionInput,
  now: Date,
): Promise<ModerationActionRow> {
  const endsAt =
    input.durationDays === null ? null : new Date(now.getTime() + input.durationDays * 86_400_000);

  const action = await insertAction(executor, {
    subjectUserId: input.subjectUserId,
    action: input.action,
    restrictionScope: {
      restrictions: input.restrictions,
      durationDays: input.durationDays,
      contributingEventIds: input.contributingEventIds ?? [],
    },
    startsAt: now,
    endsAt,
    reasonCode: input.reasonCode,
    rationale: input.rationale,
    caseId: input.caseId,
    decidedBy: input.decidedBy,
    secondReviewerId: input.secondReviewerId,
  });

  switch (input.action) {
    case "warn":
      break;
    case "restrict":
      for (const capability of input.restrictions) {
        await insertRestriction(executor, {
          userId: input.subjectUserId,
          capability,
          until: endsAt,
          reasonCode: input.reasonCode,
          sourceActionId: action.id,
        });
      }
      break;
    case "hide_profile":
      await insertRestriction(executor, {
        userId: input.subjectUserId,
        capability: "listing.visible",
        until: endsAt,
        reasonCode: input.reasonCode,
        sourceActionId: action.id,
      });
      await refreshMentorListing(executor, input.subjectUserId, now);
      break;
    case "suspend":
      await updateUserStatus(executor, input.subjectUserId, "suspended");
      await revokeAllSessionsForUser(executor, input.subjectUserId, "moderation_suspend", now);
      break;
    case "ban":
      await updateUserStatus(executor, input.subjectUserId, "banned");
      await revokeAllSessionsForUser(executor, input.subjectUserId, "moderation_ban", now);
      break;
    case "reinstate":
      await updateUserStatus(executor, input.subjectUserId, "active");
      await liftAllActiveRestrictionsForUser(executor, input.subjectUserId, now);
      break;
    case "remove_content":
      break; // handled by the caller (docs/10 §7.3 "content hidden with tombstone") — content-type-specific.
  }

  await writeAudit(executor, {
    actorType: input.decidedBy ? "staff" : "system",
    actorUserId: input.decidedBy,
    action: `trust.moderation_action_applied`,
    targetType: "user",
    targetId: input.subjectUserId,
    metadata: { action: input.action, reasonCode: input.reasonCode, actionId: action.id },
  });

  const subject = await findUserById(executor, input.subjectUserId);
  if (subject) {
    await enqueueJob(executor, sendAuthEmail, {
      to: subject.email,
      subject: ACTION_NOTIFICATION_SUBJECTS[input.action],
      text: input.rationale ?? `Reason: ${input.reasonCode}`,
    });
  }

  return action;
}

/**
 * Walks back an action's standing effects — shared by an overturned appeal (`appeals.ts`) and a
 * direct staff revoke (`moderation.ts`), which are the same operation modulo ceremony: lift whatever
 * it restricted, reinstate the account for suspend/ban, and excuse exactly the trust events that
 * triggered it (`restrictionScope.contributingEventIds`, captured by the policy evaluator at trigger
 * time — empty for a manually-decided action, so this is a no-op excusal in that case). Never
 * reverses `warn`/`remove_content` (no standing effect) or `reinstate` (nothing to put back).
 */
export async function reverseModerationAction(
  executor: Executor,
  action: ModerationActionRow,
  now: Date,
  excuseReason: string,
): Promise<void> {
  switch (action.action) {
    case "warn":
    case "remove_content":
      break;
    case "restrict":
    case "hide_profile":
      await liftAllActiveRestrictionsForUser(executor, action.subjectUserId, now);
      if (action.action === "hide_profile") {
        await refreshMentorListing(executor, action.subjectUserId, now);
      }
      break;
    case "suspend":
    case "ban":
      await updateUserStatus(executor, action.subjectUserId, "active");
      await liftAllActiveRestrictionsForUser(executor, action.subjectUserId, now);
      break;
    case "reinstate":
      break;
  }

  const contributingEventIds = Array.isArray(action.restrictionScope.contributingEventIds)
    ? (action.restrictionScope.contributingEventIds as string[])
    : [];
  for (const eventId of contributingEventIds) {
    await excuseTrustEvent(executor, eventId, excuseReason);
  }
}

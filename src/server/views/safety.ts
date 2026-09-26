import type { Database } from "@/server/platform/db/client";
import { findUsersByIds, listMyBlocks } from "@/server/modules/auth";
import { APPEAL_WINDOW_DAYS, getMyEnforcementStatus } from "@/server/modules/trust";

export type StandingNotice = {
  id: string;
  action: string;
  reasonCode: string;
  createdAt: Date;
  endsAt: Date | null;
  restrictions: string[];
  appeal: { status: string; createdAt: Date; decidedAt: Date | null } | null;
  /** Set while an appeal can still be made. */
  appealableUntil: Date | null;
};

export type SafetyView = {
  restrictions: { capability: string; until: Date | null }[];
  notices: StandingNotice[];
  blocked: { userId: string; name: string; blockedAt: Date }[];
};

/**
 * The Safety settings tab (docs/10 §7.3–7.4): active limits, every notice with its reason, how
 * long it lasts and how to appeal, and the people this user has blocked.
 */
export async function loadSafety(db: Database, userId: string, now: Date): Promise<SafetyView> {
  const [status, blocks] = await Promise.all([
    getMyEnforcementStatus(db, userId, now),
    listMyBlocks(db, userId),
  ]);
  const people = await findUsersByIds(
    db,
    blocks.map((b) => b.blockedId),
  );
  const names = new Map(people.map((p) => [p.id, p.displayName]));
  const appealable = new Set(status.appealableActionIds);
  const appeals = new Map(status.appeals.map((a) => [a.moderationActionId, a]));

  return {
    restrictions: status.restrictions.map((r) => ({ capability: r.capability, until: r.until })),
    notices: status.actions
      .map((action) => {
        const appeal = appeals.get(action.id);
        const scope = action.restrictionScope as { restrictions?: string[] };
        return {
          id: action.id,
          action: action.action,
          reasonCode: action.reasonCode,
          createdAt: action.createdAt,
          endsAt: action.endsAt,
          restrictions: scope.restrictions ?? [],
          appeal: appeal
            ? { status: appeal.status, createdAt: appeal.createdAt, decidedAt: appeal.decidedAt }
            : null,
          appealableUntil: appealable.has(action.id)
            ? new Date(action.createdAt.getTime() + APPEAL_WINDOW_DAYS * 86_400_000)
            : null,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    blocked: blocks.map((b) => ({
      userId: b.blockedId,
      name: names.get(b.blockedId) ?? "Former member",
      blockedAt: b.createdAt,
    })),
  };
}

/** For the dashboard banner: a notice from the last 30 days, or a limit still in place. */
export function needsAttention(view: SafetyView, now: Date): boolean {
  const recent = now.getTime() - APPEAL_WINDOW_DAYS * 86_400_000;
  return (
    view.restrictions.length > 0 ||
    view.notices.some((n) => n.action !== "reinstate" && n.createdAt.getTime() >= recent)
  );
}

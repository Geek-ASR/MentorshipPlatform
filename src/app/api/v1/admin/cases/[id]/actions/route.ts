import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { CAPABILITIES } from "@/server/modules/auth";
import { decideCase, dismissCase, MODERATION_ACTION_TYPES } from "@/server/modules/trust";
import type { ModerationActionType } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("dismiss"), rationale: z.string().trim().min(1).max(2000) }),
  z.object({
    decision: z.literal("act"),
    action: z.enum(MODERATION_ACTION_TYPES),
    restrictions: z.array(z.enum(CAPABILITIES)).default([]),
    durationDays: z.number().int().min(1).max(365).nullable().default(null),
    reasonCode: z.string().trim().min(1).max(60),
    rationale: z.string().trim().max(2000).optional(),
    secondReviewerId: z.uuid().optional(),
    contributingEventIds: z.array(z.uuid()).optional(),
    upheldSeverity: z.enum(["minor", "major"]).optional(),
  }),
]);

/** docs/10 §7.3's per-action role table: `ban` is admin + a second reviewer; every other action is
 * any moderator-and-above decision. */
function assertRoleForAction(action: ModerationActionType, hasSecondReviewer: boolean): void {
  if (action !== "ban") return;
  if (!hasSecondReviewer) {
    throw new AppError("VALIDATION_FAILED", {
      detail: "A ban decision requires a second reviewer.",
    });
  }
}

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/cases/:id/actions",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
    rateLimit: { limit: 60, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, params, body, getDb, clock }) => {
    if (body.decision === "dismiss") {
      authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
        now: clock.now(),
      });
      if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
      await dismissCase(await getDb(), params.id, actor.userId, body.rationale, clock.now());
      return { status: 204 };
    }

    const now = clock.now();
    const requiredRoles =
      body.action === "ban"
        ? (["admin", "super_admin"] as const)
        : (["moderator", "admin", "super_admin"] as const);
    authorize(actor, requireStaff(requiredRoles), undefined, { now });
    const db = await getDb();
    // docs/07 §5: "bans and suspensions" require step-up; warn/restrict/etc. don't.
    if (body.action === "suspend" || body.action === "ban") {
      const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
      authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    }
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    assertRoleForAction(body.action, Boolean(body.secondReviewerId));

    const action = await decideCase(
      db,
      {
        caseId: params.id,
        action: body.action,
        restrictions: body.restrictions,
        durationDays: body.durationDays,
        reasonCode: body.reasonCode,
        rationale: body.rationale ?? null,
        decidedBy: actor.userId,
        secondReviewerId: body.secondReviewerId ?? null,
        contributingEventIds: body.contributingEventIds,
        upheldSeverity: body.upheldSeverity,
      },
      clock.now(),
    );
    return { status: 201, body: action };
  },
);

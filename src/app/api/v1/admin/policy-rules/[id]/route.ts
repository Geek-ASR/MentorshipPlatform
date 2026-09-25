import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { CAPABILITIES } from "@/server/modules/auth";
import {
  MODERATION_ACTION_TYPES,
  TRUST_EVENT_TYPES,
  updatePolicyRuleForAdmin,
} from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });

const conditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sum_points_gte"), value: z.number().int().positive() }),
  z.object({
    kind: z.literal("count_type_gte"),
    eventType: z.enum(TRUST_EVENT_TYPES),
    value: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("rate_gte"),
    ratePct: z.number().positive().max(100),
    minSessions: z.number().int().positive(),
  }),
]);

const ruleBodySchema = z.object({
  windowDays: z.number().int().positive(),
  anyOf: z.array(conditionSchema).min(1),
  action: z.enum(MODERATION_ACTION_TYPES),
  durationDays: z.number().int().positive().nullable(),
  restrictions: z.array(z.enum(CAPABILITIES)),
  autoApply: z.boolean(),
  requiresSecondReviewer: z.boolean(),
  notifyTemplate: z.string().min(1).max(200),
});

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  ruleBody: ruleBodySchema.optional(),
  reason: z.string().trim().min(3).max(500),
});

export const PUT = defineRoute(
  {
    name: "PUT /api/v1/admin/policy-rules/:id",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now });
    const db = await getDb();
    // docs/07 §5: policy-rule edits are a config/enforcement change, same step-up bar as settings.
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const rule = await updatePolicyRuleForAdmin(db, {
      ruleId: params.id,
      enabled: body.enabled,
      ruleBody: body.ruleBody,
      reason: body.reason,
      decidedBy: actor.userId,
    });
    return { body: rule };
  },
);

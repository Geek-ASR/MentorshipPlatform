import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import {
  COMMISSION_SCOPE_TYPES,
  FEE_BEARERS,
  createCommissionRule,
  listCommissionRulesForAdmin,
} from "@/server/modules/payments";

export const GET = defineRoute(
  { name: "GET /api/v1/admin/commission-rules" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin", "finance"]), undefined, {
      now: clock.now(),
    });
    const rules = await listCommissionRulesForAdmin(await getDb());
    return { body: { rules } };
  },
);

const bodySchema = z.object({
  scopeType: z.enum(COMMISSION_SCOPE_TYPES),
  scopeRef: z.string().min(1).max(120).optional(),
  percentBps: z.number().int().min(0).max(10_000),
  fixedMinor: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("INR"),
  minFeeMinor: z.number().int().min(0).optional(),
  maxFeeMinor: z.number().int().min(0).optional(),
  feeBearer: z.enum(FEE_BEARERS).default("mentor"),
  studentFeeBps: z.number().int().min(0).max(10_000).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  validFrom: z.iso.datetime().optional(),
  validTo: z.iso.datetime().optional(),
  reason: z.string().trim().min(1).max(500),
});

export const POST = defineRoute(
  { name: "POST /api/v1/admin/commission-rules", body: bodySchema, idempotency: "required" },
  async ({ actor, body, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now });
    const db = await getDb();
    // docs/07 §5: commission/settings changes require step-up.
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const rule = await createCommissionRule(db, actor.userId, {
      scopeType: body.scopeType,
      scopeRef: body.scopeRef ?? null,
      percentBps: body.percentBps,
      fixedMinor: body.fixedMinor,
      currency: body.currency,
      minFeeMinor: body.minFeeMinor ?? null,
      maxFeeMinor: body.maxFeeMinor ?? null,
      feeBearer: body.feeBearer,
      studentFeeBps: body.studentFeeBps ?? null,
      priority: body.priority,
      validFrom: body.validFrom ? new Date(body.validFrom) : clock.now(),
      validTo: body.validTo ? new Date(body.validTo) : null,
      reason: body.reason,
    });
    return { status: 201, body: rule };
  },
);

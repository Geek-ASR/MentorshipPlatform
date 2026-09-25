import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { createReport, REPORT_REASON_CODES, REPORT_TARGET_TYPES } from "@/server/modules/trust";

const bodySchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1).max(200),
  reasonCode: z.enum(REPORT_REASON_CODES),
  details: z.string().trim().max(2000).optional(),
});

/** docs/06 §7.8: always acknowledges — never an existence oracle for the reported target. */
export const POST = defineRoute(
  {
    name: "POST /api/v1/reports",
    body: bodySchema,
    idempotency: "required",
    rateLimit: { limit: 30, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await createReport(await getDb(), actor.userId, body);
    return { status: 202, body: result };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { addMentorAvailabilityRule, listMentorAvailabilityRules } from "@/server/modules/booking";

export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor/availability-rules" },
  async ({ actor, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const rules = await listMentorAvailabilityRules(await getDb(), actor.userId);
    return { body: rules };
  },
);

const bodySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().optional(),
});

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor/availability-rules", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const rule = await addMentorAvailabilityRule(await getDb(), actor.userId, body);
    return { status: 201, body: rule };
  },
);

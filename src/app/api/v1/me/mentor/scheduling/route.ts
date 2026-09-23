import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSchedulingSettings, updateSchedulingSettings } from "@/server/modules/booking";

export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor/scheduling" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const settings = await getSchedulingSettings(await getDb(), actor.userId, clock.now());
    return { body: settings };
  },
);

const patchSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  slotStepMin: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
  bufferAfterMin: z.number().int().min(0).max(60).optional(),
  minNoticeMin: z.number().int().min(60).max(10_080).optional(),
  maxAdvanceDays: z.number().int().min(7).max(90).optional(),
  maxSessionsPerDay: z.number().int().min(1).max(12).optional(),
});

export const PATCH = defineRoute(
  { name: "PATCH /api/v1/me/mentor/scheduling", body: patchSchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const settings = await updateSchedulingSettings(await getDb(), actor.userId, body, clock.now());
    return { body: settings };
  },
);

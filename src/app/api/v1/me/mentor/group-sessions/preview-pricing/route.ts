import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { previewGroupSeatPricing } from "@/server/modules/booking";

const bodySchema = z.object({
  targetTotalMinor: z.number().int().min(0),
  capacity: z.number().int().min(2).max(100),
  minParticipants: z.number().int().min(1),
  currency: z.string().length(3).default("INR"),
});

/** Read-only seat-pricing helper (docs/09 §8) — no session is created. */
export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor/group-sessions/preview-pricing", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const preview = await previewGroupSeatPricing(await getDb(), actor.userId, body, clock.now());
    return { body: preview };
  },
);

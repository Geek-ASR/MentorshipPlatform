import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { RESIDENCY_STATUSES, submitEligibilityAttestation } from "@/server/modules/profiles";

const bodySchema = z.object({
  countryIso2: z.string().regex(/^[A-Z]{2}$/),
  residencyStatus: z.enum(RESIDENCY_STATUSES),
});

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor-application/eligibility", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await submitEligibilityAttestation(await getDb(), actor.userId, body, { clock });
    return { body: result };
  },
);

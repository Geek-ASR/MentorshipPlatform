import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { updateMentorService } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z
  .object({
    isActive: z.boolean().optional(),
    /** docs/09 §12 — null removes the link. */
    meetingUrl: z.string().max(500).nullable().optional(),
    intakeQuestions: z
      .array(z.object({ label: z.string().trim().min(1).max(200) }))
      .max(5)
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update." });

/** Changes that never affect price or bookable slots: visibility, meeting link, intake questions. */
export const PATCH = defineRoute(
  { name: "PATCH /api/v1/me/mentor/services/:id", params: paramsSchema, body: bodySchema },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await updateMentorService(await getDb(), actor.userId, params.id, body, clock.now());
    return { status: 204 };
  },
);

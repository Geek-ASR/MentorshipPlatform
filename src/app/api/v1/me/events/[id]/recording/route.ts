import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { setEventRecordingUrl, RECORDING_VISIBILITIES } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  recordingUrl: z.url(),
  recordingVisibility: z.enum(RECORDING_VISIBILITIES),
});

/** docs/06 `PUT /me/events/{id}/recording` — host posts a recording URL (allowlisted, docs/09 §9). */
export const PUT = defineRoute(
  { name: "PUT /api/v1/me/events/:id/recording", params: paramsSchema, body: bodySchema },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const details = await setEventRecordingUrl(
      await getDb(),
      actor.userId,
      params.id,
      body.recordingUrl,
      body.recordingVisibility,
      clock.now(),
    );
    return { body: details };
  },
);

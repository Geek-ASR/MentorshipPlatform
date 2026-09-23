import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { joinSession } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Never puts the raw meeting link in an email or ICS (docs/09 §12) — only this redirect does, after
 * checking participation and the join window, and logging a `join_click` attendance signal.
 */
export const GET = defineRoute(
  { name: "GET /api/v1/sessions/:id/join", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const { meetingUrl } = await joinSession(await getDb(), actor, params.id, clock.now());
    if (!meetingUrl)
      throw new AppError("BAD_REQUEST", {
        detail: "No meeting link has been set for this session.",
      });
    return {
      raw: new Response(null, {
        status: 302,
        headers: { location: meetingUrl, "referrer-policy": "no-referrer" },
      }),
    };
  },
);

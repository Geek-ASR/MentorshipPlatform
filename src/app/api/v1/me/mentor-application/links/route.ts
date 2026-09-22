import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { addMentorLink, MENTOR_LINK_KINDS } from "@/server/modules/profiles";

const bodySchema = z.object({ kind: z.enum(MENTOR_LINK_KINDS), url: z.string().max(500) });

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor-application/links", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const row = await addMentorLink(await getDb(), actor.userId, body.kind, body.url);
    return { status: 201, body: row };
  },
);

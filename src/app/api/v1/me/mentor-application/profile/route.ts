import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { updateMentorContent } from "@/server/modules/profiles";

const bodySchema = z.object({
  headline: z.string().trim().min(1).max(120).optional(),
  bioMd: z.string().trim().min(1).max(8000).optional(),
});

export const PATCH = defineRoute(
  { name: "PATCH /api/v1/me/mentor-application/profile", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await updateMentorContent(await getDb(), actor.userId, body);
    return { status: 204 };
  },
);

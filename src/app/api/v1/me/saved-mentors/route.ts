import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSavedMentorIds } from "@/server/modules/profiles";

export const GET = defineRoute(
  { name: "GET /api/v1/me/saved-mentors" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const mentorUserIds = await getSavedMentorIds(await getDb(), actor.userId);
    return { body: { mentorUserIds } };
  },
);

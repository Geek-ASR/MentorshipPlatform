import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { submitMentorApplication } from "@/server/modules/profiles";

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor-application/submit" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await submitMentorApplication(await getDb(), actor.userId, clock);
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { LANGUAGE_PROFICIENCIES, setMentorLanguages } from "@/server/modules/profiles";

const bodySchema = z.object({
  languages: z
    .array(z.object({ termId: z.uuid(), proficiency: z.enum(LANGUAGE_PROFICIENCIES) }))
    .max(15),
});

export const PUT = defineRoute(
  { name: "PUT /api/v1/me/mentor-application/languages", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await setMentorLanguages(await getDb(), actor.userId, body.languages);
    return { status: 204 };
  },
);

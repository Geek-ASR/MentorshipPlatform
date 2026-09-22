import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { addMentorAffiliation, AFFILIATION_KINDS } from "@/server/modules/profiles";

const bodySchema = z.object({
  kind: z.enum(AFFILIATION_KINDS),
  universityId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  programId: z.uuid().optional(),
  title: z.string().trim().min(1).max(160),
  isCurrent: z.boolean(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
});

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor-application/affiliations", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const row = await addMentorAffiliation(await getDb(), actor.userId, body);
    return { status: 201, body: row };
  },
);

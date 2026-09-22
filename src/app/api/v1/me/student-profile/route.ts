import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import {
  getStudentProfile,
  saveStudentProfile,
  STUDENT_VISIBILITIES,
} from "@/server/modules/profiles";

const bodySchema = z.object({
  visibility: z.enum(STUDENT_VISIBILITIES).optional(),
  headline: z.string().trim().max(120).optional(),
  bioMd: z.string().trim().max(4000).optional(),
});

export const GET = defineRoute(
  { name: "GET /api/v1/me/student-profile" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const profile = await getStudentProfile(await getDb(), actor.userId);
    return { body: profile ?? null };
  },
);

export const POST = defineRoute(
  { name: "POST /api/v1/me/student-profile", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await saveStudentProfile(await getDb(), actor.userId, body);
    return { status: 204 };
  },
);

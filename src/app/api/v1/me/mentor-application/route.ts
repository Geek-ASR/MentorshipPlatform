import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { findUserById } from "@/server/modules/auth";
import {
  checkApplicationCompleteness,
  findMentorProfile,
  startMentorApplication,
} from "@/server/modules/profiles";

export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor-application" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const db = await getDb();
    const profile = await findMentorProfile(db, actor.userId);
    if (!profile) return { body: { started: false } };
    const completeness = await checkApplicationCompleteness(db, actor.userId);
    return {
      body: {
        started: true,
        slug: profile.slug,
        applicationStatus: profile.applicationStatus,
        isListed: profile.isListed,
        completeness,
      },
    };
  },
);

export const POST = defineRoute(
  {
    name: "POST /api/v1/me/mentor-application",
    rateLimit: { limit: 10, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const db = await getDb();
    const user = await findUserById(db, actor.userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    const result = await startMentorApplication(db, actor.userId, user.displayName);
    return { status: 201, body: result };
  },
);

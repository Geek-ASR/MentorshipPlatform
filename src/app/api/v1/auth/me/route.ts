import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { findUserById, mfaStatus, toMeDto } from "@/server/modules/auth";

export const GET = defineRoute(
  { name: "GET /api/v1/auth/me" },
  async ({ actor, getDb, env, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const db = await getDb();
    const user = await findUserById(db, actor.userId);
    if (!user) throw new AppError("UNAUTHENTICATED");
    const { enabled } = await mfaStatus(actor.userId, {
      db,
      clock,
      mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
    });

    return { body: toMeDto(user, actor, enabled) };
  },
);

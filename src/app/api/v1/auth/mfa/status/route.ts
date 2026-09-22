import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { mfaStatus } from "@/server/modules/auth";

export const GET = defineRoute(
  { name: "GET /api/v1/auth/mfa/status" },
  async ({ actor, env, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const result = await mfaStatus(actor.userId, {
      db: await getDb(),
      clock,
      mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
    });
    return { body: result };
  },
);

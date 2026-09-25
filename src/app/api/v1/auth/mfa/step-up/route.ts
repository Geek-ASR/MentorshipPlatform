import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { verifyMfaStepUp } from "@/server/modules/auth";

const bodySchema = z.object({ code: z.string().min(6).max(16) });

/**
 * Elevates the *current* session's `mfaVerified` flag for a user already enrolled in MFA — without
 * a full re-sign-in. Deliberately doesn't require `requireRecentUserAuth`: the MFA code itself is
 * the fresh proof being supplied, so requiring recent *password* auth on top would be circular for
 * exactly the staff member this exists for (a stale session that still needs to prove MFA).
 */
export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/mfa/step-up",
    body: bodySchema,
    rateLimit: { limit: 10, windowSeconds: 900, by: "actor" },
  },
  async ({ actor, body, env, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await verifyMfaStepUp(
      { userId: actor.userId, sessionId: actor.sessionId, code: body.code },
      { db: await getDb(), clock, mfaEncryptionKey: env.MFA_ENCRYPTION_KEY },
    );
    return { status: 204 };
  },
);

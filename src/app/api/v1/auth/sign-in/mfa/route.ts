import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { buildSessionCookie, completeMfaSignIn } from "@/server/modules/auth";

const bodySchema = z.object({
  pendingToken: z.string().min(16).max(256),
  code: z.string().min(6).max(16),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/sign-in/mfa",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 20, windowSeconds: 900, by: "ip" },
  },
  async ({ body, env, getDb, clock }) => {
    const result = await completeMfaSignIn(body, {
      db: await getDb(),
      clock,
      mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
    });
    return {
      body: { outcome: "signed_in" },
      headers: { "set-cookie": buildSessionCookie(result.token, result.expiresAt, env) },
    };
  },
);

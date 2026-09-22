import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { sha256Hex } from "@/server/platform/crypto";
import { auditIpPrefix } from "@/server/platform/http/client-ip";
import {
  buildClearOAuthStateCookie,
  buildSessionCookie,
  completeGoogleSignIn,
  readOAuthStateCookie,
} from "@/server/modules/auth";

const querySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(200).optional(),
});

export const GET = defineRoute(
  {
    name: "GET /api/v1/auth/google/callback",
    query: querySchema,
    actor: "none",
    rateLimit: { limit: 20, windowSeconds: 900, by: "ip" },
  },
  async ({ query, request, env, getDb, clock, clientIp }) => {
    const pending = readOAuthStateCookie(request.headers, env);
    if (query.error || !query.code || !query.state) {
      throw new AppError("BAD_REQUEST", { detail: "Sign-in with Google was cancelled or failed." });
    }

    const result = await completeGoogleSignIn(
      { code: query.code, state: query.state, pending },
      {
        db: await getDb(),
        clock,
        env,
        ipPrefix: auditIpPrefix(clientIp),
        userAgentHash: sha256Hex(request.headers.get("user-agent") ?? ""),
      },
    );

    return {
      status: 302,
      headers: {
        location: `${env.APP_BASE_URL}/`,
        "set-cookie": [
          buildSessionCookie(result.token, result.expiresAt, env),
          buildClearOAuthStateCookie(env),
        ],
      },
    };
  },
);

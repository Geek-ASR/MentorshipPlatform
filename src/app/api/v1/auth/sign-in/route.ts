import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { auditIpPrefix } from "@/server/platform/http/client-ip";
import { buildSessionCookie, signIn } from "@/server/modules/auth";
import { sha256Hex } from "@/server/platform/crypto";

const bodySchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/sign-in",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 20, windowSeconds: 900, by: "ip" },
  },
  async ({ body, request, env, getDb, clock, clientIp }) => {
    const result = await signIn(body, {
      db: await getDb(),
      clock,
      ipPrefix: auditIpPrefix(clientIp),
      userAgentHash: sha256Hex(request.headers.get("user-agent") ?? ""),
    });

    if (result.outcome === "mfa_required") {
      return { body: { outcome: "mfa_required", pendingToken: result.pendingToken } };
    }

    return {
      body: { outcome: "signed_in" },
      headers: { "set-cookie": buildSessionCookie(result.token, result.expiresAt, env) },
    };
  },
);

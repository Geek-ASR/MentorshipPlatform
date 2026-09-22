import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { auditIpPrefix } from "@/server/platform/http/client-ip";
import { createHibpChecker, signUp } from "@/server/modules/auth";
import { getLogger } from "@/server/platform/logger";

const bodySchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(120),
  birthYear: z.number().int().min(1900).max(2100),
  termsVersion: z.string().min(1).max(40),
  privacyVersion: z.string().min(1).max(40),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/auth/sign-up",
    body: bodySchema,
    actor: "none",
    rateLimit: { limit: 10, windowSeconds: 3600, by: "ip" },
  },
  async ({ body, env, getDb, clock, clientIp }) => {
    const result = await signUp(body, {
      db: await getDb(),
      clock,
      appBaseUrl: env.APP_BASE_URL,
      ipPrefix: auditIpPrefix(clientIp),
      checkBreached: createHibpChecker(getLogger()),
    });
    return { body: result };
  },
);

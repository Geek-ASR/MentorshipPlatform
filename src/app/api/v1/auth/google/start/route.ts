import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { buildOAuthStateCookie, startGoogleSignIn } from "@/server/modules/auth";

const querySchema = z.object({
  birthYear: z.coerce.number().int().min(1900).max(2100),
  termsVersion: z.string().min(1).max(40),
  privacyVersion: z.string().min(1).max(40),
});

/** Full-page navigation: the browser follows the redirect to Google directly. */
export const GET = defineRoute(
  {
    name: "GET /api/v1/auth/google/start",
    query: querySchema,
    actor: "none",
    rateLimit: { limit: 20, windowSeconds: 900, by: "ip" },
  },
  async ({ query, env }) => {
    const { authorizationUrl, pending } = startGoogleSignIn(query, env);
    return {
      status: 302,
      headers: { location: authorizationUrl, "set-cookie": buildOAuthStateCookie(pending, env) },
    };
  },
);

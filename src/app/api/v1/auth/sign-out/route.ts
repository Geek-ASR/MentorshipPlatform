import { defineRoute } from "@/server/platform/http/route";
import { buildClearSessionCookie, readSessionToken, signOut } from "@/server/modules/auth";

export const POST = defineRoute(
  { name: "POST /api/v1/auth/sign-out", actor: "none" },
  async ({ request, env, getDb, clock }) => {
    const token = readSessionToken(request.headers, env);
    if (token) await signOut(token, { db: await getDb(), clock });
    return { status: 204, headers: { "set-cookie": buildClearSessionCookie(env) } };
  },
);

import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { listSessions, readSessionToken, toSessionSummaryDto } from "@/server/modules/auth";

export const GET = defineRoute(
  { name: "GET /api/v1/auth/sessions" },
  async ({ actor, request, env, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const currentToken = readSessionToken(request.headers, env);
    const sessions = await listSessions(actor.userId, currentToken, { db: await getDb() });
    return { body: sessions.map(toSessionSummaryDto) };
  },
);

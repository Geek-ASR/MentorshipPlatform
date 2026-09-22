import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { listCredentials } from "@/server/modules/verification";

export const GET = defineRoute(
  { name: "GET /api/v1/me/verification/credentials" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const credentials = await listCredentials(await getDb(), actor.userId);
    return { body: credentials };
  },
);

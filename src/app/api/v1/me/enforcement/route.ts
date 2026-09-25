import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getMyEnforcementStatus } from "@/server/modules/trust";

export const GET = defineRoute(
  { name: "GET /api/v1/me/enforcement" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const status = await getMyEnforcementStatus(await getDb(), actor.userId, clock.now());
    return { body: status };
  },
);

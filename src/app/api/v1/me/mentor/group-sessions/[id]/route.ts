import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { getGroupSessionForMentor } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor/group-sessions/:id", params: paramsSchema },
  async ({ actor, params, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await getGroupSessionForMentor(await getDb(), actor.userId, params.id);
    return { body: result, headers: { "cache-control": "no-store" } };
  },
);

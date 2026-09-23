import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { getCancellationQuote } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/bookings/:id/cancellation-quote", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const quote = await getCancellationQuote(await getDb(), actor.userId, params.id, clock.now());
    return { body: quote, headers: { "cache-control": "no-store" } };
  },
);

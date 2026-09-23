import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { getBookingForUser } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/bookings/:id", params: paramsSchema },
  async ({ actor, params, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const booking = await getBookingForUser(await getDb(), actor.userId, params.id);
    return { body: booking };
  },
);

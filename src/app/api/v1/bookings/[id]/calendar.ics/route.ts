import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { getBookingIcsContent } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/bookings/:id/calendar.ics", params: paramsSchema },
  async ({ actor, params, getDb, clock, env }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const ics = await getBookingIcsContent(
      await getDb(),
      actor.userId,
      params.id,
      env.APP_BASE_URL,
      clock.now(),
    );
    return {
      raw: new Response(ics, {
        status: 200,
        headers: {
          "content-type": "text/calendar; charset=utf-8; method=REQUEST",
          "content-disposition": `attachment; filename="session-${params.id}.ics"`,
          "cache-control": "no-store",
        },
      }),
    };
  },
);

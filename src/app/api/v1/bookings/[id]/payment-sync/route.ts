import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { syncPaidBooking } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * After checkout the browser asks "is it paid yet?" (docs/08 §6 rule 5, docs/22 §3 J1). The server
 * re-reads the provider's own record and settles the booking if the payment captured — the answer
 * never depends on anything the client claims.
 */
export const POST = defineRoute(
  {
    name: "POST /api/v1/bookings/:id/payment-sync",
    params: paramsSchema,
    rateLimit: { limit: 60, windowSeconds: 600, by: "actor" },
  },
  async ({ actor, params, getDb, clock, env }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const booking = await syncPaidBooking(
      await getDb(),
      actor,
      params.id,
      clock.now(),
      env.APP_BASE_URL,
    );
    return {
      body: { id: booking.id, status: booking.status, confirmedAt: booking.confirmedAt },
      headers: { "cache-control": "no-store" },
    };
  },
);

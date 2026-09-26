import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { getPublicSeatCount } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Live seat count for a group session or a public/unlisted event (docs/09 §8, §9). Event and profile
 * pages are cached for a minute; the register panel reads this on load so "Register" versus "Join
 * the waitlist" is decided on the current count. Private events and 1:1 sessions are a 404.
 */
export const GET = defineRoute(
  { name: "GET /api/v1/sessions/:id/seats", params: paramsSchema },
  async ({ params, getDb }) => {
    const seats = await getPublicSeatCount(await getDb(), params.id);
    if (!seats) throw new AppError("NOT_FOUND");
    return { body: seats, headers: { "cache-control": "no-store" } };
  },
);

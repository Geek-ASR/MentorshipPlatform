import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { findMentorProfileBySlug } from "@/server/modules/profiles";
import { getAvailableSlots } from "@/server/modules/booking";

const paramsSchema = z.object({ slug: z.string().min(1).max(200) });
const querySchema = z.object({
  serviceId: z.uuid(),
  durationMin: z.coerce.number().int().min(15).max(180),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

/** Public, advisory slot list (docs/09 §4) — `no-store` since the booking transaction re-validates. */
export const GET = defineRoute(
  { name: "GET /api/v1/mentors/:slug/slots", params: paramsSchema, query: querySchema },
  async ({ params, query, getDb, clock }) => {
    const mentor = await findMentorProfileBySlug(await getDb(), params.slug);
    if (!mentor) throw new AppError("NOT_FOUND");
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to <= from || to.getTime() - from.getTime() > 31 * 86_400_000) {
      throw new AppError("BAD_REQUEST", { detail: "Window must be positive and at most 31 days." });
    }
    const slots = await getAvailableSlots(
      await getDb(),
      {
        mentorUserId: mentor.userId,
        serviceId: query.serviceId,
        durationMin: query.durationMin,
        from,
        to,
      },
      clock.now(),
    );
    return {
      body: {
        slots: slots.map((s) => ({ startsAt: s.start.toISOString(), endsAt: s.end.toISOString() })),
      },
      headers: { "cache-control": "no-store" },
    };
  },
);

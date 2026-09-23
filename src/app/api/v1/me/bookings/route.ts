import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import {
  listBookingsForMentor,
  listBookingsForStudent,
  sessionWindow,
} from "@/server/modules/booking";

const querySchema = z.object({ role: z.enum(["student", "mentor"]).default("student") });

export const GET = defineRoute(
  { name: "GET /api/v1/me/bookings", query: querySchema },
  async ({ actor, query, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const db = await getDb();
    const rows =
      query.role === "mentor"
        ? await listBookingsForMentor(db, actor.userId)
        : await listBookingsForStudent(db, actor.userId);
    return {
      body: {
        bookings: rows.map((r) => {
          const { start, end } = sessionWindow(r.session);
          return {
            id: r.id,
            status: r.status,
            priceMinor: r.priceMinor,
            currency: r.currency,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
          };
        }),
      },
      headers: { "cache-control": "no-store" },
    };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { BOOKING_STATUSES, listBookingsForAdmin } from "@/server/modules/booking";

const querySchema = z.object({ status: z.enum(BOOKING_STATUSES).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/bookings", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "finance", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const bookings = await listBookingsForAdmin(await getDb(), { status: query.status });
    return { body: { bookings } };
  },
);

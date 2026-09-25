import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { PAYMENT_STATUSES, listPaymentsForAdmin } from "@/server/modules/payments";

const querySchema = z.object({ status: z.enum(PAYMENT_STATUSES).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/payments", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["finance", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const payments = await listPaymentsForAdmin(await getDb(), { status: query.status });
    return { body: { payments } };
  },
);

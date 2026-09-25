import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { TRANSFER_STATUSES, listTransfersForAdmin } from "@/server/modules/payments";

const querySchema = z.object({ status: z.enum(TRANSFER_STATUSES).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/transfers", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["finance", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const transfers = await listTransfersForAdmin(await getDb(), { status: query.status });
    return { body: { transfers } };
  },
);

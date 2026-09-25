import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { DISPUTE_STATUSES, listDisputesForAdmin } from "@/server/modules/trust";

const querySchema = z.object({ status: z.enum(DISPUTE_STATUSES).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/disputes", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const disputes = await listDisputesForAdmin(await getDb(), { status: query.status });
    return { body: { disputes } };
  },
);

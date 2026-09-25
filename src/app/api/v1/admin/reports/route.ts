import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listRecentReports } from "@/server/modules/trust";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/reports", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const reports = await listRecentReports(await getDb(), query.limit);
    return { body: { reports } };
  },
);

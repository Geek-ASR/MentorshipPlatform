import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listModerationCases, MODERATION_CASE_STATUSES } from "@/server/modules/trust";

const querySchema = z.object({ status: z.enum(MODERATION_CASE_STATUSES).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/cases", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const cases = await listModerationCases(await getDb(), { status: query.status });
    return { body: { cases } };
  },
);

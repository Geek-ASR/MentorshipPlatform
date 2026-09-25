import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { getCaseDetail } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/cases/:id", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const detail = await getCaseDetail(await getDb(), params.id);
    return { body: detail };
  },
);

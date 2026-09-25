import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { OUTBOX_STATUSES } from "@/server/platform/db/tables/platform";
import { listOutboxJobsForAdmin } from "@/server/platform/outbox/outbox";

const querySchema = z.object({ status: z.enum(OUTBOX_STATUSES).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/outbox", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    const jobs = await listOutboxJobsForAdmin(await getDb(), { status: query.status });
    return { body: { jobs } };
  },
);

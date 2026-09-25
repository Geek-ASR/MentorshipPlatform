import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import {
  MENTOR_APPLICATION_STATUSES,
  listMentorApplicationsForAdmin,
} from "@/server/modules/profiles";

const querySchema = z.object({ status: z.enum(MENTOR_APPLICATION_STATUSES).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/mentor-applications", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    const applications = await listMentorApplicationsForAdmin(await getDb(), {
      status: query.status,
    });
    return { body: { applications } };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listUsersForAdmin } from "@/server/modules/auth";

const querySchema = z.object({ q: z.string().trim().max(200).optional() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/users", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin", "moderator", "finance"]), undefined, {
      now: clock.now(),
    });
    const users = await listUsersForAdmin(await getDb(), { q: query.q });
    return { body: { users } };
  },
);

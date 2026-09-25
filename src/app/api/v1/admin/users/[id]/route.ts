import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import {
  findUserById,
  listRestrictionRowsForUser,
  rolesForUser,
  toActiveRestrictions,
} from "@/server/modules/auth";

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/users/:id", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin", "moderator", "finance"]), undefined, {
      now: clock.now(),
    });
    const db = await getDb();
    const user = await findUserById(db, params.id);
    if (!user) throw new AppError("NOT_FOUND");
    const [roles, restrictionRows] = await Promise.all([
      rolesForUser(db, params.id),
      listRestrictionRowsForUser(db, params.id),
    ]);
    return {
      body: { user, roles, restrictions: toActiveRestrictions(restrictionRows, clock.now()) },
    };
  },
);

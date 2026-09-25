import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listAppealsForReview } from "@/server/modules/trust";

export const GET = defineRoute(
  { name: "GET /api/v1/admin/appeals" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    const appeals = await listAppealsForReview(await getDb());
    return { body: { appeals } };
  },
);

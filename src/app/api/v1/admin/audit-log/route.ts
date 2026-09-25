import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listAuditLogsForAdmin, verifyAuditChain } from "@/server/platform/audit";

const querySchema = z.object({
  targetType: z.string().max(60).optional(),
  actorUserId: z.uuid().optional(),
});

export const GET = defineRoute(
  { name: "GET /api/v1/admin/audit-log", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    const db = await getDb();
    const [entries, brokenAtId] = await Promise.all([
      listAuditLogsForAdmin(db, query),
      verifyAuditChain(db),
    ]);
    return { body: { entries, chainIntact: brokenAtId === null, brokenAtId } };
  },
);

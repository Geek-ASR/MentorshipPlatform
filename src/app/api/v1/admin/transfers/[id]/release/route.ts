import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { adminReleaseTransfer, createFakeGateway } from "@/server/modules/payments";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/transfers/:id/release",
    params: paramsSchema,
    idempotency: "required",
  },
  async ({ actor, params, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["finance", "admin", "super_admin"]), undefined, { now });
    const db = await getDb();
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const gateway = createFakeGateway(db);
    // Posts a ledger journal — the balance check is deferred to commit, so this needs an explicit
    // transaction (payments/infra/ledger-repo.ts).
    const transfer = await db.transaction((tx) =>
      adminReleaseTransfer(tx, gateway, actor.userId, params.id, clock.now()),
    );
    return { body: transfer };
  },
);

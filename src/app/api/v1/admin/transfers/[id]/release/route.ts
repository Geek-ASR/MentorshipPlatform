import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { adminReleaseTransfer, createFakeGateway } from "@/server/modules/payments";

const paramsSchema = z.object({ id: z.uuid() });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/transfers/:id/release",
    params: paramsSchema,
    idempotency: "required",
  },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireStaff(["finance", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const db = await getDb();
    const gateway = createFakeGateway(db);
    // Posts a ledger journal — the balance check is deferred to commit, so this needs an explicit
    // transaction (payments/infra/ledger-repo.ts).
    const transfer = await db.transaction((tx) =>
      adminReleaseTransfer(tx, gateway, actor.userId, params.id, clock.now()),
    );
    return { body: transfer };
  },
);

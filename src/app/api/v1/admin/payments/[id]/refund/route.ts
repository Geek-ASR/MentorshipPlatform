import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireRecentUserAuth, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { adminRefundPayment, createFakeGateway } from "@/server/modules/payments";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  refundMinor: z.number().int().positive(),
  reasonCode: z.string().trim().min(1).max(60),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/payments/:id/refund",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    const now = clock.now();
    authorize(actor, requireStaff(["finance", "admin", "super_admin"]), undefined, { now });
    const db = await getDb();
    // docs/07 §5: refunds require step-up (recent primary auth), not just a staff role.
    const recentAuthWindowMinutes = await getSetting(db, "auth.recent_auth_window_min", now);
    authorize(actor, requireRecentUserAuth, undefined, { now, recentAuthWindowMinutes });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const gateway = createFakeGateway(db);
    // adminRefundPayment posts a multi-line ledger journal, whose balance check is deferred to
    // commit — it must run inside an explicit transaction (see payments/infra/ledger-repo.ts).
    const outcome = await db.transaction((tx) =>
      adminRefundPayment(
        tx,
        gateway,
        actor.userId,
        params.id,
        body.refundMinor,
        body.reasonCode,
        clock.now(),
      ),
    );
    return { status: 201, body: outcome };
  },
);

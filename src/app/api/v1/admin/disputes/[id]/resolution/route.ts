import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import {
  DISPUTE_RESOLUTIONS,
  decideDisputeAppeal,
  getDisputeForAdmin,
  resolveDispute,
} from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  resolution: z.enum(DISPUTE_RESOLUTIONS),
  atFaultUserId: z.uuid().nullable().default(null),
  partialRefundPct: z.number().int().min(0).max(100).optional(),
  rationale: z.string().trim().min(1).max(2000),
});

/**
 * docs/06 §7.9 `POST /admin/disputes/{id}/resolution` — the one route the doc lists for a dispute
 * decision, so it also covers the dispute's own appeal step (docs/10 §8's `appealed -> closed`),
 * branching on the dispute's current status rather than adding a second, undocumented route.
 */
export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/disputes/:id/resolution",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
    rateLimit: { limit: 60, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["moderator", "finance", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const db = await getDb();
    const dispute = await getDisputeForAdmin(db, params.id);

    if (dispute.status === "appealed") {
      const updated = await decideDisputeAppeal(
        db,
        {
          disputeId: params.id,
          reviewerId: actor.userId,
          upheld: body.resolution === dispute.resolution,
          rationale: body.rationale,
        },
        clock.now(),
      );
      return { body: updated };
    }

    const updated = await resolveDispute(
      db,
      {
        disputeId: params.id,
        resolution: body.resolution,
        atFaultUserId: body.atFaultUserId,
        partialRefundPct: body.partialRefundPct,
        rationale: body.rationale,
        decidedBy: actor.userId,
      },
      clock.now(),
    );
    return { body: updated };
  },
);

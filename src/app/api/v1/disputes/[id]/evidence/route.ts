import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { DISPUTE_EVIDENCE_KINDS, submitDisputeEvidence } from "@/server/modules/trust";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  kind: z.enum(DISPUTE_EVIDENCE_KINDS),
  content: z.string().trim().max(4000).optional(),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/disputes/:id/evidence",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const evidence = await submitDisputeEvidence(await getDb(), actor.userId, params.id, {
      kind: body.kind,
      content: body.content ?? null,
    });
    return { status: 201, body: evidence };
  },
);

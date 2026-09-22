import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { revokeCredentialAsStaff } from "@/server/modules/verification";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ mentorUserId: z.uuid(), reason: z.string().trim().min(3).max(500) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/verification/credentials/:id/revoke",
    params: paramsSchema,
    body: bodySchema,
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin", "verification_reviewer"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await revokeCredentialAsStaff(
      await getDb(),
      actor.userId,
      params.id,
      body.mentorUserId,
      body.reason,
      clock,
    );
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { reviewMentorApplication } from "@/server/modules/profiles";

const paramsSchema = z.object({ userId: z.uuid() });
const bodySchema = z.object({
  decision: z.enum(["approved", "rejected", "paused"]),
  rejectionReason: z.string().trim().max(500).optional(),
});

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/mentor-applications/:userId/review",
    params: paramsSchema,
    body: bodySchema,
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin"]), undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    await reviewMentorApplication(
      await getDb(),
      actor.userId,
      params.userId,
      body.decision,
      clock,
      body.rejectionReason,
    );
    return { status: 204 };
  },
);

import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { verifyArticle } from "@/server/modules/content";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ nextReviewDueAt: z.iso.datetime().optional() });

/** Records a fresh editorial pass without touching publish status (docs/12 §14 review-due queue). */
export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/articles/:id/verify",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["content_editor", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const article = await verifyArticle(await getDb(), actor.userId, params.id, {
      nextReviewDueAt: body.nextReviewDueAt ? new Date(body.nextReviewDueAt) : undefined,
    });
    return { body: article };
  },
);

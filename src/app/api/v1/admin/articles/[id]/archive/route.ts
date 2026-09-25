import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { archiveArticle } from "@/server/modules/content";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = defineRoute(
  {
    name: "POST /api/v1/admin/articles/:id/archive",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(["content_editor", "admin", "super_admin"]), undefined, {
      now: clock.now(),
    });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const article = await archiveArticle(await getDb(), actor.userId, params.id, body.reason);
    return { body: article };
  },
);

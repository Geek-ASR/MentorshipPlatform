import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { isStaff } from "@/server/platform/authz/actor";
import { AppError } from "@/server/platform/errors";
import { getMentorProfileDetailBySlug, toMentorProfilePageDto } from "@/server/modules/profiles";

const paramsSchema = z.object({ slug: z.string().min(1).max(200) });

/** Public profile (docs/22 §10.1): visible when listed, or to the owner/staff for preview. */
export const GET = defineRoute(
  { name: "GET /api/v1/mentors/:slug", params: paramsSchema },
  async ({ actor, params, getDb }) => {
    const detail = await getMentorProfileDetailBySlug(await getDb(), params.slug);
    if (!detail) throw new AppError("NOT_FOUND");

    const isOwner = actor.kind === "user" && actor.userId === detail.profile.userId;
    if (!detail.profile.isListed && !isOwner && !isStaff(actor)) throw new AppError("NOT_FOUND");

    return { body: toMentorProfilePageDto(detail) };
  },
);

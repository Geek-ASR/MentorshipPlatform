import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { findMentorProfileBySlug } from "@/server/modules/profiles";
import { listPublishedReviewsForMentor } from "@/server/modules/trust";

const paramsSchema = z.object({ slug: z.string().min(1).max(200) });

/**
 * docs/06 §7.4 `GET /mentors/{slug}/reviews`. Returns every published review for the mentor — this
 * phase doesn't build cursor pagination for this one listing (documented deviation, docs/19 Phase
 * 10 retrospective); a mentor's published-review count is small enough at this stage to return in
 * full.
 */
export const GET = defineRoute(
  { name: "GET /api/v1/mentors/:slug/reviews", params: paramsSchema },
  async ({ params, getDb }) => {
    const db = await getDb();
    const profile = await findMentorProfileBySlug(db, params.slug);
    if (!profile) throw new AppError("NOT_FOUND");
    const reviews = await listPublishedReviewsForMentor(db, profile.userId);
    return { body: { reviews } };
  },
);

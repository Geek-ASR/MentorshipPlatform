import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { searchMentors } from "@/server/modules/profiles";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  university: z.uuid().optional(),
  company: z.uuid().optional(),
  category: z.uuid().optional(),
  language: z.uuid().optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

const PAGE_SIZE = 20;

export const GET = defineRoute(
  {
    name: "GET /api/v1/mentors",
    query: querySchema,
    actor: "none",
    rateLimit: { limit: 60, windowSeconds: 60, by: "ip" },
  },
  async ({ query, getDb }) => {
    const results = await searchMentors(await getDb(), {
      q: query.q,
      universityId: query.university,
      companyId: query.company,
      categoryId: query.category,
      languageId: query.language,
      countryIso2: query.country,
      limit: PAGE_SIZE,
      offset: (query.page - 1) * PAGE_SIZE,
    });
    return {
      body: {
        mentors: results.mentors,
        total: results.total,
        page: query.page,
        pageSize: PAGE_SIZE,
      },
    };
  },
);

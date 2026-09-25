import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import {
  ARTICLE_DISCLAIMER_KINDS,
  ARTICLE_SOURCE_TYPES,
  ARTICLE_STATUSES,
  createArticle,
  listArticlesForAdmin,
} from "@/server/modules/content";

const CONTENT_STAFF = ["content_editor", "admin", "super_admin"] as const;

const querySchema = z.object({
  status: z.enum(ARTICLE_STATUSES).optional(),
  dueForReview: z.coerce.boolean().optional(),
});

export const GET = defineRoute(
  { name: "GET /api/v1/admin/articles", query: querySchema },
  async ({ actor, query, getDb, clock }) => {
    authorize(actor, requireStaff(CONTENT_STAFF), undefined, { now: clock.now() });
    const articles = await listArticlesForAdmin(await getDb(), query);
    return { body: { articles } };
  },
);

const sourceSchema = z.object({
  url: z.url(),
  publisher: z.string().trim().min(1).max(200),
  isOfficial: z.boolean(),
  accessedAt: z.iso.date(),
});

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  dek: z.string().trim().max(300).optional(),
  bodyMd: z.string().trim().min(1),
  categoryTermId: z.uuid().optional(),
  countryIso2: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .optional(),
  universityId: z.uuid().optional(),
  sourceType: z.enum(ARTICLE_SOURCE_TYPES).default("editorial"),
  sources: z.array(sourceSchema).default([]),
  disclaimerKind: z.enum(ARTICLE_DISCLAIMER_KINDS).optional(),
  appliesToIntake: z.string().trim().max(60).optional(),
});

export const POST = defineRoute(
  { name: "POST /api/v1/admin/articles", body: bodySchema, idempotency: "required" },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireStaff(CONTENT_STAFF), undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const article = await createArticle(await getDb(), actor.userId, {
      title: body.title,
      dek: body.dek ?? null,
      bodyMd: body.bodyMd,
      categoryTermId: body.categoryTermId ?? null,
      countryIso2: body.countryIso2 ?? null,
      universityId: body.universityId ?? null,
      sourceType: body.sourceType,
      sources: body.sources,
      disclaimerKind: body.disclaimerKind ?? null,
      appliesToIntake: body.appliesToIntake ?? null,
    });
    return { status: 201, body: article };
  },
);

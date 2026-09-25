import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import {
  ARTICLE_DISCLAIMER_KINDS,
  ARTICLE_SOURCE_TYPES,
  getArticleForAdmin,
  updateArticle,
} from "@/server/modules/content";

const CONTENT_STAFF = ["content_editor", "admin", "super_admin"] as const;

const paramsSchema = z.object({ id: z.uuid() });

export const GET = defineRoute(
  { name: "GET /api/v1/admin/articles/:id", params: paramsSchema },
  async ({ actor, params, getDb, clock }) => {
    authorize(actor, requireStaff(CONTENT_STAFF), undefined, { now: clock.now() });
    const article = await getArticleForAdmin(await getDb(), params.id);
    return { body: article };
  },
);

const sourceSchema = z.object({
  url: z.url(),
  publisher: z.string().trim().min(1).max(200),
  isOfficial: z.boolean(),
  accessedAt: z.iso.date(),
});

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  dek: z.string().trim().max(300).nullable().optional(),
  bodyMd: z.string().trim().min(1).optional(),
  categoryTermId: z.uuid().nullable().optional(),
  countryIso2: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  universityId: z.uuid().nullable().optional(),
  sourceType: z.enum(ARTICLE_SOURCE_TYPES).optional(),
  sources: z.array(sourceSchema).optional(),
  disclaimerKind: z.enum(ARTICLE_DISCLAIMER_KINDS).nullable().optional(),
  appliesToIntake: z.string().trim().max(60).nullable().optional(),
  renameSlug: z.boolean().optional(),
});

export const PUT = defineRoute(
  { name: "PUT /api/v1/admin/articles/:id", params: paramsSchema, body: bodySchema },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireStaff(CONTENT_STAFF), undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const article = await updateArticle(await getDb(), actor.userId, params.id, body);
    return { body: article };
  },
);

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleForAdmin } from "@/server/modules/content";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { taxonomyTerms, countries } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { isAppError } from "@/server/platform/errors";
import { ActionButton } from "@/ui/action-button";
import { Badge } from "@/ui/badge";
import { CardDescription, CardTitle } from "@/ui/card";
import { ArticleForm } from "../article-form";

export const metadata = { title: "Edit guide" };

type PageParams = { id: string };

async function loadOptions() {
  const db = await getDb();
  const [categoryRows, countryRows, universityRows] = await Promise.all([
    db
      .select({ id: taxonomyTerms.id, name: taxonomyTerms.name })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabulary, "category"))
      .orderBy(taxonomyTerms.sortOrder),
    db
      .select({ iso2: countries.iso2, name: countries.name })
      .from(countries)
      .where(eq(countries.studyAbroadEnabled, true))
      .orderBy(countries.name),
    db
      .select({ id: universities.id, name: universities.name })
      .from(universities)
      .orderBy(universities.name),
  ]);
  return { categoryRows, countryRows, universityRows };
}

export default async function EditArticlePage({ params }: { params: Promise<PageParams> }) {
  await requireStaffPage(["content_editor", "admin", "super_admin"], "/admin/articles");
  const { id } = await params;
  const db = await getDb();

  let article;
  try {
    article = await getArticleForAdmin(db, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const options = await loadOptions();

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <CardTitle className="text-2xl">{article.title}</CardTitle>
            <Badge tone={article.status === "published" ? "primary" : "neutral"}>
              {article.status}
            </Badge>
          </div>
          <CardDescription>
            /guides/{article.slug}
            {article.status === "published" ? (
              <>
                {" · "}
                <Link href={`/guides/${article.slug}`} className="text-primary hover:underline">
                  View live
                </Link>
              </>
            ) : null}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {article.status !== "published" ? (
            <ActionButton path={`/api/v1/admin/articles/${id}/publish`} variant="primary">
              Publish
            </ActionButton>
          ) : (
            <ActionButton path={`/api/v1/admin/articles/${id}/verify`} variant="secondary">
              Mark re-verified today
            </ActionButton>
          )}
          {article.status !== "archived" ? (
            <ActionButton
              path={`/api/v1/admin/articles/${id}/archive`}
              method="POST"
              body={{ reason: "manual archive" }}
              variant="ghost"
              confirmText="Archive this guide? It will stop showing on the public site."
            >
              Archive
            </ActionButton>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Last verified</dt>
          <dd className="tabular text-ink">
            {article.lastVerifiedAt ? new Date(article.lastVerifiedAt).toLocaleDateString("en-GB") : "Never"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Review due</dt>
          <dd className="tabular text-ink">
            {article.nextReviewDueAt ? new Date(article.nextReviewDueAt).toLocaleDateString("en-GB") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Sources</dt>
          <dd className="text-ink">{article.sources.length}</dd>
        </div>
      </dl>

      <div className="mt-6 max-w-2xl">
        <ArticleForm
          articleId={article.id}
          initial={{
            title: article.title,
            dek: article.dek ?? "",
            bodyMd: article.bodyMd,
            categoryTermId: article.categoryTermId ?? "",
            countryIso2: article.countryIso2 ?? "",
            universityId: article.universityId ?? "",
            sourceType: article.sourceType,
            sources: article.sources,
            disclaimerKind: article.disclaimerKind ?? "",
            appliesToIntake: article.appliesToIntake ?? "",
          }}
          {...options}
        />
      </div>
    </div>
  );
}

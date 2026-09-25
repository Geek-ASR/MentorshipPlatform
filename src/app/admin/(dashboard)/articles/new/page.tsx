import { eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { taxonomyTerms, countries } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { CardDescription, CardTitle } from "@/ui/card";
import { ArticleForm } from "../article-form";

export const metadata = { title: "New guide" };

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

export default async function NewArticlePage() {
  await requireStaffPage(["content_editor", "admin", "super_admin"], "/admin/articles/new");
  const options = await loadOptions();

  return (
    <div>
      <CardTitle className="text-2xl">New guide</CardTitle>
      <CardDescription>
        Starts as a draft. Add at least one source before publishing (docs/12 §14).
      </CardDescription>
      <div className="mt-6 max-w-2xl">
        <ArticleForm {...options} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { taxonomyTerms, countries } from "@/server/platform/db/tables/reference";
import { listPublishedArticles } from "@/server/modules/content";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Country, city, university and career guides written from real experience — sourced, dated and reviewed.",
  alternates: { canonical: "/guides" },
};

const PAGE_SIZE = 20;

type SearchParams = { category?: string; country?: string; page?: string };

async function loadFilterOptions() {
  const db = await getDb();
  const [categoryRows, countryRows] = await Promise.all([
    db
      .select({ id: taxonomyTerms.id, name: taxonomyTerms.name })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabulary, "category")),
    db
      .select({ iso2: countries.iso2, name: countries.name })
      .from(countries)
      .where(eq(countries.studyAbroadEnabled, true))
      .orderBy(countries.name),
  ]);
  return { categoryRows, countryRows };
}

function freshnessLine(article: { lastVerifiedAt: Date | null; appliesToIntake: string | null }): string | null {
  if (!article.lastVerifiedAt) return null;
  const parts = [`Last verified ${new Date(article.lastVerifiedAt).toLocaleDateString("en-GB")}`];
  if (article.appliesToIntake) parts.push(`Applies to ${article.appliesToIntake} intake`);
  return parts.join(" · ");
}

export default async function GuidesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const db = await getDb();
  const [{ articles, total }, { categoryRows, countryRows }] = await Promise.all([
    listPublishedArticles(db, {
      categoryTermId: params.category,
      countryIso2: params.country,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    loadFilterOptions(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (targetPage: number): string => {
    const query = new URLSearchParams();
    if (params.category) query.set("category", params.category);
    if (params.country) query.set("country", params.country);
    query.set("page", String(targetPage));
    return `/guides?${query.toString()}`;
  };

  return (
    <Container className="py-12 md:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Guides</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Written from real experience, with sources and a last-verified date on every page.
      </p>

      <form
        method="GET"
        className="mt-8 grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:grid-cols-3"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Category</span>
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-sm text-ink"
          >
            <option value="">Any</option>
            {categoryRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Country</span>
          <select
            name="country"
            defaultValue={params.country ?? ""}
            className="h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-sm text-ink"
          >
            <option value="">Any</option>
            {countryRows.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit">Filter</Button>
        </div>
      </form>

      {articles.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<BookOpen className="size-8" aria-hidden="true" />}
          title="No guides match these filters yet"
          description="Try clearing a filter — new guides are published regularly."
          action={
            <Button asChild variant="secondary">
              <Link href="/guides">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <li key={article.id}>
              <Link href={`/guides/${article.slug}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-primary">
                  <CardTitle>{article.title}</CardTitle>
                  {article.dek ? <CardDescription>{article.dek}</CardDescription> : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {article.disclaimerKind ? <Badge tone="accent">Mentor experience</Badge> : null}
                    {freshnessLine(article) ? (
                      <span className="text-xs text-ink-muted">{freshnessLine(article)}</span>
                    ) : null}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={pageHref(page - 1)}>Previous</Link>
            </Button>
          ) : null}
          <span className="tabular text-sm text-ink-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={pageHref(page + 1)}>Next</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </Container>
  );
}

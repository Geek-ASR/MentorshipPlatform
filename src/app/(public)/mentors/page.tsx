import type { Metadata } from "next";
import { Search } from "lucide-react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { isUuid } from "@/server/platform/ids";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { searchMentors, type SearchFilters } from "@/server/modules/profiles";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

export const metadata: Metadata = {
  title: "Explore mentors",
  description:
    "Find a mentor by university, category, language or country — every price shown upfront.",
  alternates: { canonical: "/mentors" },
};

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  university?: string;
  category?: string;
  language?: string;
  country?: string;
  page?: string;
};

async function loadFilterOptions() {
  const db = await getDb();
  const [universityRows, categoryRows, languageRows] = await Promise.all([
    db
      .select({ id: universities.id, name: universities.name })
      .from(universities)
      .orderBy(universities.name),
    db
      .select({ id: taxonomyTerms.id, name: taxonomyTerms.name })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabulary, "category")),
    db
      .select({ id: taxonomyTerms.id, name: taxonomyTerms.name })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabulary, "language"))
      .orderBy(taxonomyTerms.sortOrder),
  ]);
  return { universityRows, categoryRows, languageRows };
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: { id: string; name: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-sm text-ink"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function MentorsExplorePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const db = await getDb();
  // `university`/`category`/`language` are cast to `::uuid` in the search query (mentor_search_
  // documents' array columns) — a malformed value (a stale link, a crafted URL, a scanner probe)
  // must not 500 the whole page; treat it the same as the filter not being set (docs/19 Phase 14
  // finding, confirmed via a real ZAP scan: `/mentors?language=en` crashed before this validation).
  const [{ mentors, total }, { universityRows, categoryRows, languageRows }] = await Promise.all([
    searchMentors(db, {
      q: params.q,
      universityId: isUuid(params.university) ? params.university : undefined,
      categoryId: isUuid(params.category) ? params.category : undefined,
      languageId: isUuid(params.language) ? params.language : undefined,
      countryIso2: params.country,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    } satisfies SearchFilters),
    loadFilterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (targetPage: number): string => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.university) query.set("university", params.university);
    if (params.category) query.set("category", params.category);
    if (params.language) query.set("language", params.language);
    if (params.country) query.set("country", params.country);
    query.set("page", String(targetPage));
    return `/mentors?${query.toString()}`;
  };

  return (
    <Container className="py-12 md:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Explore mentors
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Every mentor here has been reviewed and has at least one verified affiliation.
      </p>

      <form
        method="GET"
        className="mt-8 grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2 lg:col-span-2">
          <span className="font-medium text-ink">Keyword</span>
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="e.g. system design, TU Munich"
            className="h-11 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-sm text-ink"
          />
        </label>
        <FilterSelect
          name="university"
          label="University"
          value={params.university}
          options={universityRows}
        />
        <FilterSelect
          name="category"
          label="Category"
          value={params.category}
          options={categoryRows}
        />
        <FilterSelect
          name="language"
          label="Language"
          value={params.language}
          options={languageRows}
        />
        <div className="flex items-end sm:col-span-2 lg:col-span-5">
          <Button type="submit">
            <Search aria-hidden="true" /> Search
          </Button>
        </div>
      </form>

      {mentors.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Search className="size-8" aria-hidden="true" />}
          title="No mentors match these filters yet"
          description="Try clearing a filter, or check back soon — new mentors are reviewed regularly."
          action={
            <Button asChild variant="secondary">
              <Link href="/mentors">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mentors.map((mentor) => (
            <li key={mentor.slug}>
              <Link href={`/mentors/${mentor.slug}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-primary">
                  <CardTitle>{mentor.displayName}</CardTitle>
                  {mentor.headline ? <CardDescription>{mentor.headline}</CardDescription> : null}
                  {mentor.countryIso2 ? (
                    <div className="mt-4">
                      <Badge>{mentor.countryIso2}</Badge>
                    </div>
                  ) : null}
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

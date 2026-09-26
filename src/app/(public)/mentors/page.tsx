import type { Metadata } from "next";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { isUuid } from "@/server/platform/ids";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { searchMentors, type SearchFilters } from "@/server/modules/profiles";
import { loadMentorCards } from "@/server/views/mentor-cards";
import { Button } from "@/ui/button";
import { Container } from "@/ui/container";
import { pluralize } from "@/ui/format";
import { Select } from "@/ui/input";
import { MentorCard } from "@/ui/mentor-card";
import { EmptyState } from "@/ui/states";
import { FiltersDisclosure } from "./filters-disclosure";

export const metadata: Metadata = {
  title: "Explore mentors",
  description:
    "Find a mentor by university, category, language or country — every price shown upfront.",
  alternates: { canonical: "/mentors" },
};

const PAGE_SIZE = 12;

type SearchParams = {
  q?: string;
  university?: string;
  category?: string;
  language?: string;
  country?: string;
  page?: string;
};

type Option = { id: string; name: string };

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
      .where(eq(taxonomyTerms.vocabulary, "category"))
      .orderBy(asc(taxonomyTerms.name)),
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
  options: Option[];
}) {
  const id = `filter-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <Select id={id} name={name} defaultValue={value ?? ""}>
        <option value="">Any {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
    </div>
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
  const filters = {
    universityId: isUuid(params.university) ? params.university : undefined,
    categoryId: isUuid(params.category) ? params.category : undefined,
    languageId: isUuid(params.language) ? params.language : undefined,
  };
  const [{ mentors, total }, { universityRows, categoryRows, languageRows }] = await Promise.all([
    searchMentors(db, {
      q: params.q,
      ...filters,
      countryIso2: params.country,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    } satisfies SearchFilters),
    loadFilterOptions(),
  ]);
  const cards = await loadMentorCards(
    db,
    mentors.map((m) => m.userId),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefWith = (changes: Partial<Record<keyof SearchParams, string | undefined>>): string => {
    const merged: Record<string, string | undefined> = { ...params, page: undefined, ...changes };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, value);
    const qs = query.toString();
    return qs ? `/mentors?${qs}` : "/mentors";
  };

  const nameOf = (options: Option[], id: string | undefined) =>
    options.find((o) => o.id === id)?.name;
  const chips = [
    params.q ? { key: "q" as const, label: `“${params.q}”` } : null,
    filters.universityId
      ? { key: "university" as const, label: nameOf(universityRows, filters.universityId) }
      : null,
    filters.categoryId
      ? { key: "category" as const, label: nameOf(categoryRows, filters.categoryId) }
      : null,
    filters.languageId
      ? { key: "language" as const, label: nameOf(languageRows, filters.languageId) }
      : null,
  ].filter((chip): chip is { key: "q" | "university" | "category" | "language"; label: string } =>
    Boolean(chip?.label),
  );
  const activeFilterCount = chips.filter((chip) => chip.key !== "q").length;

  return (
    <div>
      <section className="border-b border-line bg-surface">
        <Container className="py-10 md:py-14">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Explore mentors
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Every mentor is reviewed by our team and has at least one affiliation confirmed through
            their university or work email.
          </p>
          <form method="GET" role="search" className="mt-6 flex max-w-2xl gap-2">
            {filters.universityId ? (
              <input type="hidden" name="university" value={filters.universityId} />
            ) : null}
            {filters.categoryId ? (
              <input type="hidden" name="category" value={filters.categoryId} />
            ) : null}
            {filters.languageId ? (
              <input type="hidden" name="language" value={filters.languageId} />
            ) : null}
            <label htmlFor="explore-q" className="sr-only">
              Search mentors
            </label>
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <input
                id="explore-q"
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="e.g. system design, TU Munich, APS"
                className="h-11 w-full rounded-[var(--radius-control)] border border-line bg-canvas pr-3 pl-9 text-sm text-ink placeholder:text-ink-muted/80 hover:border-ink/25 focus-visible:border-primary"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </Container>
      </section>

      <Container className="grid grid-cols-1 gap-8 py-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Filters">
          <FiltersDisclosure activeCount={activeFilterCount}>
            <form
              method="GET"
              className="space-y-5 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:sticky lg:top-24"
            >
              {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
              <p className="text-sm font-semibold text-ink">Filter mentors</p>
              <FilterSelect
                name="university"
                label="University"
                value={filters.universityId}
                options={universityRows}
              />
              <FilterSelect
                name="category"
                label="Topic"
                value={filters.categoryId}
                options={categoryRows}
              />
              <FilterSelect
                name="language"
                label="Language"
                value={filters.languageId}
                options={languageRows}
              />
              <div className="flex flex-col gap-2 pt-1">
                <Button type="submit">Show results</Button>
                {activeFilterCount > 0 ? (
                  <Button asChild variant="ghost">
                    <Link
                      href={hrefWith({
                        university: undefined,
                        category: undefined,
                        language: undefined,
                      })}
                    >
                      Clear filters
                    </Link>
                  </Button>
                ) : null}
              </div>
            </form>
          </FiltersDisclosure>
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <h2 id="results-heading" className="text-sm font-medium text-ink">
              {pluralize(total, "mentor")}
              {chips.length > 0 ? " matching" : ""}
            </h2>
            {chips.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Active filters">
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <Link
                      href={hrefWith({ [chip.key]: undefined })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-2 pl-3 text-sm text-ink hover:border-primary/40"
                    >
                      {chip.label}
                      <X className="size-3.5 text-ink-muted" aria-hidden="true" />
                      <span className="sr-only">(remove filter)</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {cards.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<Search className="size-8" aria-hidden="true" />}
              title="No mentors match these filters yet"
              description="Try a broader keyword or clear a filter — new mentors are reviewed every week."
              action={
                <Button asChild variant="secondary">
                  <Link href="/mentors">Clear all</Link>
                </Button>
              }
            />
          ) : (
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
              {cards.map((card) => (
                <li key={card.userId}>
                  <MentorCard card={card} />
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3">
              {page > 1 ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={hrefWith({ page: String(page - 1) })}>Previous</Link>
                </Button>
              ) : null}
              <span className="tabular text-sm text-ink-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={hrefWith({ page: String(page + 1) })}>Next</Link>
                </Button>
              ) : null}
            </nav>
          ) : null}
        </section>
      </Container>
    </div>
  );
}

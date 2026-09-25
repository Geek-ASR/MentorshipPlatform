import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { searchMentors } from "@/server/modules/profiles";
import { countPublishedArticles, listArticlesByCategory } from "@/server/modules/content";
import { Badge } from "@/ui/badge";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

type PageParams = { category: string };

async function loadCategory(slug: string) {
  const db = await getDb();
  const [category] = await db
    .select()
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.vocabulary, "category"), eq(taxonomyTerms.slug, slug)))
    .limit(1);
  return category ?? null;
}

async function loadPageData(categoryId: string) {
  const db = await getDb();
  const [{ mentors, total: mentorTotal }, guideCount, guides] = await Promise.all([
    searchMentors(db, { categoryId, limit: 12, offset: 0 }),
    countPublishedArticles(db, { categoryTermId: categoryId }),
    listArticlesByCategory(db, categoryId, 4),
  ]);
  return { mentors, mentorTotal, guideCount, guides };
}

/** docs/22 §10.6 quality threshold: only indexable with at least one listed mentor or a guide. */
export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) return { title: "Career mentorship", robots: { index: false, follow: false } };
  const { mentorTotal, guideCount } = await loadPageData(category.id);
  const indexable = mentorTotal > 0 || guideCount > 0;
  return {
    title: `${category.name} mentors`,
    description: `${category.name} mentors and guides on ${category.name.toLowerCase()} — from people who've done it.`,
    alternates: { canonical: `/career/${category.slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function CareerCategoryPage({ params }: { params: Promise<PageParams> }) {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();
  const { mentors, mentorTotal, guideCount, guides } = await loadPageData(category.id);

  return (
    <Container className="py-12 md:py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/career" className="hover:text-ink">
          Career & academic
        </Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {category.name} mentors
      </h1>
      {category.description ? (
        <p className="mt-2 max-w-2xl text-ink-muted">{category.description}</p>
      ) : (
        <p className="mt-2 max-w-2xl text-ink-muted">
          Mentors who can help with {category.name.toLowerCase()}, plus guides written from real
          experience.
        </p>
      )}

      {mentorTotal === 0 && guideCount === 0 ? (
        <EmptyState
          className="mt-10"
          title="Nothing here yet"
          description="This topic doesn't have a listed mentor or guide yet — check back soon."
        />
      ) : (
        <>
          {mentors.length > 0 ? (
            <section aria-labelledby="mentors-heading" className="mt-10">
              <h2 id="mentors-heading" className="text-xl font-semibold text-ink">
                Mentors
              </h2>
              <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {mentors.map((mentor) => (
                  <li key={mentor.slug}>
                    <Link href={`/mentors/${mentor.slug}`} className="block h-full">
                      <Card className="h-full transition-colors hover:border-primary">
                        <CardTitle>{mentor.displayName}</CardTitle>
                        {mentor.headline ? (
                          <CardDescription>{mentor.headline}</CardDescription>
                        ) : null}
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
              {mentorTotal > mentors.length ? (
                <Link
                  href={`/mentors?category=${category.id}`}
                  className="mt-4 inline-block text-sm text-primary hover:underline"
                >
                  See all {mentorTotal} mentors →
                </Link>
              ) : null}
            </section>
          ) : null}

          {guides.length > 0 ? (
            <section aria-labelledby="guides-heading" className="mt-10">
              <h2 id="guides-heading" className="text-xl font-semibold text-ink">
                Guides
              </h2>
              <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {guides.map((guide) => (
                  <li key={guide.id}>
                    <Link href={`/guides/${guide.slug}`} className="block h-full">
                      <Card className="h-full transition-colors hover:border-primary">
                        <CardTitle className="text-base">{guide.title}</CardTitle>
                        {guide.dek ? <CardDescription>{guide.dek}</CardDescription> : null}
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </Container>
  );
}

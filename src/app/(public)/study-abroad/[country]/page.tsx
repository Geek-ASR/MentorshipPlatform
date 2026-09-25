import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Scale } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { countries } from "@/server/platform/db/tables/reference";
import { cities } from "@/server/platform/db/tables/geo";
import { searchMentors } from "@/server/modules/profiles";
import { countPublishedArticles, listArticlesByCountry } from "@/server/modules/content";
import { Badge } from "@/ui/badge";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

type PageParams = { country: string };

async function loadCountry(slug: string) {
  const db = await getDb();
  const [country] = await db.select().from(countries).where(eq(countries.slug, slug)).limit(1);
  return country ?? null;
}

async function loadPageData(countryIso2: string) {
  const db = await getDb();
  const [{ mentors, total: mentorTotal }, guideCount, guides, cityRows] = await Promise.all([
    searchMentors(db, { countryIso2, limit: 12, offset: 0 }),
    countPublishedArticles(db, { countryIso2 }),
    listArticlesByCountry(db, countryIso2, 6),
    db
      .select({ slug: cities.slug, name: cities.name })
      .from(cities)
      .where(eq(cities.countryIso2, countryIso2))
      .orderBy(cities.name),
  ]);
  return { mentors, mentorTotal, guideCount, guides, cityRows };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { country: slug } = await params;
  const country = await loadCountry(slug);
  if (!country || !country.studyAbroadEnabled) {
    return { title: "Study abroad", robots: { index: false, follow: false } };
  }
  const { mentorTotal, guideCount } = await loadPageData(country.iso2);
  // docs/22 §10.6: indexable only with real content, not a template-filled shell.
  const indexable = mentorTotal > 0 || guideCount > 0;
  return {
    title: `Study in ${country.name}`,
    description: `Mentors and guides on studying, applications, visas and life in ${country.name} — from people who've been there.`,
    alternates: { canonical: `/study-abroad/${country.slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function StudyAbroadCountryPage({ params }: { params: Promise<PageParams> }) {
  const { country: slug } = await params;
  const country = await loadCountry(slug);
  if (!country || !country.studyAbroadEnabled) notFound();
  const { mentors, mentorTotal, guideCount, guides, cityRows } = await loadPageData(country.iso2);

  return (
    <Container className="py-12 md:py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/study-abroad" className="hover:text-ink">
          Study abroad
        </Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Study in {country.name}
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Admissions, the visa process as others experienced it, housing and life in {country.name} —
        from mentors who&apos;ve done it.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-primary-soft/30 px-4 py-3 text-sm text-ink">
        <Scale className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Mentor experience, not official university, immigration, legal or financial advice. Always
          confirm with official sources.
        </p>
      </div>

      {cityRows.length > 0 ? (
        <section aria-labelledby="cities-heading" className="mt-10">
          <h2 id="cities-heading" className="text-xl font-semibold text-ink">
            Cities
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {cityRows.map((city) => (
              <li key={city.slug}>
                <Link
                  href={`/study-abroad/${country.slug}/${city.slug}`}
                  className="inline-block rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:border-primary"
                >
                  {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mentorTotal === 0 && guideCount === 0 ? (
        <EmptyState
          className="mt-10"
          title="Nothing here yet"
          description="We don't have a listed mentor or guide for this country yet — check back soon."
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
                        <div className="mt-4">
                          <Badge>{country.iso2}</Badge>
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
              {mentorTotal > mentors.length ? (
                <Link
                  href={`/mentors?country=${country.iso2}`}
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
              <Link
                href={`/guides/country/${country.slug}`}
                className="mt-4 inline-block text-sm text-primary hover:underline"
              >
                All {country.name} guides →
              </Link>
            </section>
          ) : null}
        </>
      )}
    </Container>
  );
}

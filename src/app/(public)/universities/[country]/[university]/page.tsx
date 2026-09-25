import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { countries } from "@/server/platform/db/tables/reference";
import { cities, universities } from "@/server/platform/db/tables/geo";
import { searchMentors } from "@/server/modules/profiles";
import { countPublishedArticles, listArticlesByUniversity } from "@/server/modules/content";
import { Badge } from "@/ui/badge";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

type PageParams = { country: string; university: string };

async function loadUniversity(countrySlug: string, universitySlug: string) {
  const db = await getDb();
  const [country] = await db
    .select()
    .from(countries)
    .where(eq(countries.slug, countrySlug))
    .limit(1);
  if (!country) return null;
  const [row] = await db
    .select({ university: universities, cityName: cities.name })
    .from(universities)
    .leftJoin(cities, eq(cities.id, universities.cityId))
    .where(and(eq(universities.countryIso2, country.iso2), eq(universities.slug, universitySlug)))
    .limit(1);
  if (!row) return null;
  return { country, university: row.university, cityName: row.cityName };
}

async function loadPageData(universityId: string) {
  const db = await getDb();
  const [{ mentors, total: mentorTotal }, guideCount, guides] = await Promise.all([
    searchMentors(db, { universityId, limit: 12, offset: 0 }),
    countPublishedArticles(db, { universityId }),
    listArticlesByUniversity(db, universityId, 4),
  ]);
  return { mentors, mentorTotal, guideCount, guides };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { country: countrySlug, university: universitySlug } = await params;
  const loaded = await loadUniversity(countrySlug, universitySlug);
  if (!loaded) return { title: "Universities", robots: { index: false, follow: false } };
  const { mentorTotal, guideCount } = await loadPageData(loaded.university.id);
  // docs/22 §10.1: indexable only with ≥1 verified mentor affiliation or a guide; else noindex.
  const indexable = mentorTotal > 0 || guideCount > 0;
  return {
    title: `${loaded.university.name} mentors`,
    description: `Mentors and guides from ${loaded.university.name} — admissions, courses and student life from people who studied there.`,
    alternates: { canonical: `/universities/${loaded.country.slug}/${loaded.university.slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", title: loaded.university.name },
  };
}

export default async function UniversityPage({ params }: { params: Promise<PageParams> }) {
  const { country: countrySlug, university: universitySlug } = await params;
  const loaded = await loadUniversity(countrySlug, universitySlug);
  if (!loaded) notFound();
  const { country, university, cityName } = loaded;
  const { mentors, mentorTotal, guideCount, guides } = await loadPageData(university.id);

  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: appBaseUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: "Study abroad",
            item: `${appBaseUrl}/study-abroad`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: country.name,
            item: `${appBaseUrl}/study-abroad/${country.slug}`,
          },
          {
            "@type": "ListItem",
            position: 4,
            name: university.name,
            item: `${appBaseUrl}/universities/${country.slug}/${university.slug}`,
          },
        ],
      },
      {
        "@type": "CollegeOrUniversity",
        name: university.name,
        ...(cityName
          ? {
              address: {
                "@type": "PostalAddress",
                addressLocality: cityName,
                addressCountry: country.iso2,
              },
            }
          : {}),
        ...(university.website ? { sameAs: university.website } : {}),
      },
    ],
  };

  return (
    <Container className="py-12 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1 text-sm text-ink-muted">
        <Link href="/study-abroad" className="hover:text-ink">
          Study abroad
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/study-abroad/${country.slug}`} className="hover:text-ink">
          {country.name}
        </Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {university.name}
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        {cityName ? `${cityName}, ${country.name}` : country.name}
        {university.website ? (
          <>
            {" · "}
            <a
              href={university.website}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              Official website
            </a>
          </>
        ) : null}
      </p>

      {mentorTotal === 0 && guideCount === 0 ? (
        <EmptyState
          className="mt-10"
          title="No mentors here yet"
          description="We don't have a listed mentor from this university yet — check back soon."
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
                  href={`/mentors?university=${university.id}`}
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

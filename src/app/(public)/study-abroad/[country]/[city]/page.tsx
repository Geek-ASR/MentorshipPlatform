import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { countries } from "@/server/platform/db/tables/reference";
import { cities, universities } from "@/server/platform/db/tables/geo";
import { searchMentors } from "@/server/modules/profiles";
import { Card, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

type PageParams = { country: string; city: string };

async function loadCity(countrySlug: string, citySlug: string) {
  const db = await getDb();
  const [country] = await db.select().from(countries).where(eq(countries.slug, countrySlug)).limit(1);
  if (!country) return null;
  const [city] = await db
    .select()
    .from(cities)
    .where(and(eq(cities.countryIso2, country.iso2), eq(cities.slug, citySlug)))
    .limit(1);
  if (!city) return null;
  return { country, city };
}

async function loadUniversitiesWithMentorCounts(cityId: string) {
  const db = await getDb();
  const universityRows = await db
    .select({ id: universities.id, slug: universities.slug, name: universities.name })
    .from(universities)
    .where(eq(universities.cityId, cityId))
    .orderBy(universities.name);

  const withCounts = await Promise.all(
    universityRows.map(async (u) => {
      const { total } = await searchMentors(db, { universityId: u.id, limit: 1, offset: 0 });
      return { ...u, mentorCount: total };
    }),
  );
  return withCounts;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { country: countrySlug, city: citySlug } = await params;
  const loaded = await loadCity(countrySlug, citySlug);
  if (!loaded) return { title: "Study abroad", robots: { index: false, follow: false } };
  const universityRows = await loadUniversitiesWithMentorCounts(loaded.city.id);
  // docs/22 §10.6: a city page needs real content — at least one curated university with a mentor.
  const indexable = universityRows.some((u) => u.mentorCount > 0);
  return {
    title: `Study in ${loaded.city.name}, ${loaded.country.name}`,
    description: `Universities, mentors and guides for students heading to ${loaded.city.name}, ${loaded.country.name}.`,
    alternates: { canonical: `/study-abroad/${loaded.country.slug}/${loaded.city.slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function StudyAbroadCityPage({ params }: { params: Promise<PageParams> }) {
  const { country: countrySlug, city: citySlug } = await params;
  const loaded = await loadCity(countrySlug, citySlug);
  if (!loaded) notFound();
  const { country, city } = loaded;
  const universityRows = await loadUniversitiesWithMentorCounts(city.id);

  return (
    <Container className="py-12 md:py-16">
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
        Study in {city.name}, {country.name}
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Universities in {city.name}, with mentors who studied or work there.
      </p>

      {universityRows.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="No universities listed for this city yet"
          description="Check back soon, or browse other cities."
        />
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {universityRows.map((university) => (
            <li key={university.id}>
              <Link
                href={`/universities/${country.slug}/${university.slug}`}
                className="block h-full"
              >
                <Card className="h-full transition-colors hover:border-primary">
                  <CardTitle className="text-base">{university.name}</CardTitle>
                  <p className="mt-2 text-sm text-ink-muted">
                    {university.mentorCount > 0
                      ? `${university.mentorCount} mentor${university.mentorCount === 1 ? "" : "s"}`
                      : "No mentors listed yet"}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

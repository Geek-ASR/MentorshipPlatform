import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { countries } from "@/server/platform/db/tables/reference";
import { Card, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";

export const metadata: Metadata = {
  title: "Study abroad",
  description:
    "Admissions, the visa process as others experienced it, housing and life in a new city — country by country.",
  alternates: { canonical: "/study-abroad" },
};

async function loadCountries() {
  const db = await getDb();
  return db
    .select({ iso2: countries.iso2, slug: countries.slug, name: countries.name })
    .from(countries)
    .where(eq(countries.studyAbroadEnabled, true))
    .orderBy(countries.name);
}

export default async function StudyAbroadHubPage() {
  const list = await loadCountries();

  return (
    <Container className="py-12 md:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Study abroad
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Admissions, the visa process as others experienced it, housing and life in a new city.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((country) => (
          <li key={country.iso2}>
            <Link href={`/study-abroad/${country.slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:border-primary">
                <CardTitle className="text-base">{country.name}</CardTitle>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

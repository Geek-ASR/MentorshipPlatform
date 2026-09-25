import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { countries } from "@/server/platform/db/tables/reference";
import { listPublishedArticles } from "@/server/modules/content";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";
import { EmptyState } from "@/ui/states";

type PageParams = { country: string };

async function loadCountry(slug: string) {
  const db = await getDb();
  const [country] = await db.select().from(countries).where(eq(countries.slug, slug)).limit(1);
  return country ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { country: slug } = await params;
  const country = await loadCountry(slug);
  if (!country) return { title: "Guides", robots: { index: false, follow: false } };
  return {
    title: `${country.name} guides`,
    description: `Guides on studying, working and settling in ${country.name}, from real experience.`,
    alternates: { canonical: `/guides/country/${country.slug}` },
  };
}

export default async function GuidesByCountryPage({ params }: { params: Promise<PageParams> }) {
  const { country: slug } = await params;
  const country = await loadCountry(slug);
  if (!country) notFound();

  const db = await getDb();
  const { articles } = await listPublishedArticles(db, {
    countryIso2: country.iso2,
    limit: 50,
    offset: 0,
  });

  return (
    <Container className="py-12 md:py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/guides" className="hover:text-ink">
          Guides
        </Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {country.name} guides
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Written from real experience, with sources and a last-verified date on every page.
      </p>

      {articles.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={`No ${country.name} guides yet`}
          description="Check back soon, or explore mentors who have been there."
        />
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <li key={article.id}>
              <Link href={`/guides/${article.slug}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-primary">
                  <CardTitle>{article.title}</CardTitle>
                  {article.dek ? <CardDescription>{article.dek}</CardDescription> : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

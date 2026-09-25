import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { Card, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";

export const metadata: Metadata = {
  title: "Career & academic mentorship",
  description:
    "Interview prep, resume review, system design, research guidance and more — from mentors who did it recently.",
  alternates: { canonical: "/career" },
};

async function loadCategories() {
  const db = await getDb();
  const [root] = await db
    .select({ id: taxonomyTerms.id })
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.vocabulary, "category"), eq(taxonomyTerms.slug, "career-academic")))
    .limit(1);
  if (!root) return [];
  return db
    .select({ id: taxonomyTerms.id, slug: taxonomyTerms.slug, name: taxonomyTerms.name })
    .from(taxonomyTerms)
    .where(
      and(
        eq(taxonomyTerms.vocabulary, "category"),
        eq(taxonomyTerms.parentId, root.id),
        isNull(taxonomyTerms.mergedIntoId),
      ),
    )
    .orderBy(taxonomyTerms.sortOrder);
}

export default async function CareerHubPage() {
  const categories = await loadCategories();

  return (
    <Container className="py-12 md:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Career & academic mentorship
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        From placements and interviews to research and portfolios — mentors who recently did the
        thing you&apos;re preparing for.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id}>
            <Link href={`/career/${category.slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:border-primary">
                <CardTitle className="text-base">{category.name}</CardTitle>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

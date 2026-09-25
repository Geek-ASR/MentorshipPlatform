import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AlertTriangle, Scale } from "lucide-react";
import { getDb } from "@/server/platform/db/client";
import { resolvePublicArticleSlug, type ArticleRow } from "@/server/modules/content";
import { brand } from "@/config/brand";
import { Badge } from "@/ui/badge";
import { Container } from "@/ui/container";

type PageParams = { slug: string };

async function loadResolved(slug: string) {
  const db = await getDb();
  return resolvePublicArticleSlug(db, slug);
}

/** docs/12 §14: the exact mentor-experience disclaimer copy, shown whenever a guide carries a
 * sensitive-topic flag — regardless of `sourceType`, since even an editorial guide on a visa
 * topic still isn't official advice. */
const DISCLAIMER_TEXT =
  "Mentor experience, not official university, immigration, legal or financial advice. Always confirm with official sources.";

function freshnessLine(article: ArticleRow): string {
  const parts: string[] = [];
  if (article.lastVerifiedAt) {
    parts.push(`Last verified ${new Date(article.lastVerifiedAt).toLocaleDateString("en-GB")}`);
  }
  if (article.appliesToIntake) parts.push(`Applies to ${article.appliesToIntake} intake`);
  const officialSources = article.sources.filter((s) => s.isOfficial).map((s) => s.publisher);
  if (officialSources.length > 0) parts.push(`Sources: ${officialSources.join(", ")} (official)`);
  return parts.join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await loadResolved(slug);
  if (!resolved) return { title: "Guide not found", robots: { index: false, follow: false } };
  if ("redirectTo" in resolved)
    return { title: "Guide moved", robots: { index: false, follow: false } };
  const { article } = resolved;
  const description = article.dek ?? article.bodyMd.replace(/\s+/g, " ").slice(0, 155);
  return {
    title: article.title,
    description,
    alternates: { canonical: `/guides/${article.slug}` },
    openGraph: { type: "article", title: article.title, description },
  };
}

export default async function GuidePage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const resolved = await loadResolved(slug);
  if (!resolved) notFound();
  if ("redirectTo" in resolved) permanentRedirect(`/guides/${resolved.redirectTo}`);
  const { article } = resolved;

  const isStale = article.nextReviewDueAt ? new Date(article.nextReviewDueAt) < new Date() : false;
  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: appBaseUrl },
          { "@type": "ListItem", position: 2, name: "Guides", item: `${appBaseUrl}/guides` },
          {
            "@type": "ListItem",
            position: 3,
            name: article.title,
            item: `${appBaseUrl}/guides/${article.slug}`,
          },
        ],
      },
      {
        "@type": "Article",
        headline: article.title,
        ...(article.dek ? { description: article.dek } : {}),
        author: { "@type": "Organization", name: brand.name },
        ...(article.publishedAt ? { datePublished: article.publishedAt.toISOString() } : {}),
        dateModified: article.updatedAt.toISOString(),
      },
    ],
  };

  return (
    <Container className="max-w-3xl py-12 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/guides" className="hover:text-ink">
          Guides
        </Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {article.title}
      </h1>
      {article.dek ? <p className="mt-3 text-lg text-ink-muted">{article.dek}</p> : null}

      {freshnessLine(article) ? (
        <p className="mt-5 text-sm text-ink-muted">{freshnessLine(article)}</p>
      ) : null}

      {isStale ? (
        <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>This information may be outdated — it is due for editorial review.</p>
        </div>
      ) : null}

      {article.disclaimerKind ? (
        <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-primary-soft/30 px-4 py-3 text-sm text-ink">
          <Scale className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>{DISCLAIMER_TEXT}</p>
        </div>
      ) : null}

      <div className="mt-8 max-w-[70ch] font-serif whitespace-pre-line text-ink">
        {article.bodyMd}
      </div>

      {article.sources.length > 0 ? (
        <section aria-labelledby="sources-heading" className="mt-10 border-t border-line pt-6">
          <h2 id="sources-heading" className="text-sm font-semibold text-ink">
            Sources
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {article.sources.map((source, index) => (
              <li key={index}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  {source.publisher}
                </a>
                {source.isOfficial ? (
                  <Badge tone="primary" className="ml-2">
                    official
                  </Badge>
                ) : null}
                <span className="ml-2 text-xs text-ink-muted">
                  Accessed {new Date(source.accessedAt).toLocaleDateString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}

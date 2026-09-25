import type { MetadataRoute } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { taxonomyTerms, countries } from "@/server/platform/db/tables/reference";
import { cities, universities } from "@/server/platform/db/tables/geo";
import { mentorProfiles, searchMentors } from "@/server/modules/profiles";
import { listPublicEvents } from "@/server/modules/booking";
import { countPublishedArticles, listPublishedArticles } from "@/server/modules/content";

const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const url = (path: string) => `${appBaseUrl}${path}`;

/** docs/22 §10.4: an index sitemap split by content type. Each kind below is served at
 * `/sitemap/{index}.xml`, and Next's own `/sitemap.xml` lists them — the split this codebase
 * actually needs at current scale (a few thousand rows per type at most), versus the doc's
 * illustrative `sitemap-mentors-N.xml` naming, which only matters once a single type nears the
 * 50k-URL sitemap limit (docs/22 §10.4) and needs `generateSitemaps` to fan out further. */
export const KINDS = [
  "static",
  "career",
  "study-abroad",
  "universities",
  "mentors",
  "events",
  "guides",
] as const;

export async function generateSitemaps() {
  return KINDS.map((_, index) => ({ id: index }));
}

async function staticEntries(): Promise<MetadataRoute.Sitemap> {
  const paths = [
    "/",
    "/mentors",
    "/events",
    "/career",
    "/study-abroad",
    "/guides",
    "/legal/terms",
    "/legal/privacy",
    "/legal/refund-cancellation",
    "/legal/community-guidelines",
    "/legal/grievance",
  ];
  return paths.map((path) => ({
    url: url(path),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));
}

async function careerEntries(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const [root] = await db
    .select({ id: taxonomyTerms.id })
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.vocabulary, "category"), eq(taxonomyTerms.slug, "career-academic")))
    .limit(1);
  if (!root) return [];
  const entries: MetadataRoute.Sitemap = [];
  // Quality-thresholded per docs/22 §10.6: only list a category once we know it's non-thin.
  const withIds = await db
    .select({ id: taxonomyTerms.id, slug: taxonomyTerms.slug })
    .from(taxonomyTerms)
    .where(
      and(
        eq(taxonomyTerms.vocabulary, "category"),
        eq(taxonomyTerms.parentId, root.id),
        isNull(taxonomyTerms.mergedIntoId),
      ),
    );
  for (const category of withIds) {
    const [{ total }, guideCount] = await Promise.all([
      searchMentors(db, { categoryId: category.id, limit: 1, offset: 0 }),
      countPublishedArticles(db, { categoryTermId: category.id }),
    ]);
    if (total > 0 || guideCount > 0) {
      entries.push({
        url: url(`/career/${category.slug}`),
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  }
  return entries;
}

async function studyAbroadEntries(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const countryRows = await db
    .select()
    .from(countries)
    .where(eq(countries.studyAbroadEnabled, true));
  const entries: MetadataRoute.Sitemap = [];
  for (const country of countryRows) {
    const [{ total }, guideCount] = await Promise.all([
      searchMentors(db, { countryIso2: country.iso2, limit: 1, offset: 0 }),
      countPublishedArticles(db, { countryIso2: country.iso2 }),
    ]);
    if (total > 0 || guideCount > 0) {
      entries.push({
        url: url(`/study-abroad/${country.slug}`),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    const cityRows = await db
      .select({ id: cities.id, slug: cities.slug })
      .from(cities)
      .where(eq(cities.countryIso2, country.iso2));
    for (const city of cityRows) {
      const universityRows = await db
        .select({ id: universities.id })
        .from(universities)
        .where(eq(universities.cityId, city.id));
      let cityHasMentor = false;
      for (const u of universityRows) {
        const { total: uTotal } = await searchMentors(db, {
          universityId: u.id,
          limit: 1,
          offset: 0,
        });
        if (uTotal > 0) {
          cityHasMentor = true;
          break;
        }
      }
      if (cityHasMentor) {
        entries.push({
          url: url(`/study-abroad/${country.slug}/${city.slug}`),
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
    }
  }
  return entries;
}

async function universityEntries(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const rows = await db
    .select({ id: universities.id, slug: universities.slug, countryIso2: universities.countryIso2 })
    .from(universities);
  const countryRows = await db
    .select({ iso2: countries.iso2, slug: countries.slug })
    .from(countries);
  const countrySlugByIso2 = new Map(countryRows.map((c) => [c.iso2, c.slug]));

  const entries: MetadataRoute.Sitemap = [];
  for (const u of rows) {
    const countrySlug = countrySlugByIso2.get(u.countryIso2);
    if (!countrySlug) continue;
    const [{ total }, guideCount] = await Promise.all([
      searchMentors(db, { universityId: u.id, limit: 1, offset: 0 }),
      countPublishedArticles(db, { universityId: u.id }),
    ]);
    if (total > 0 || guideCount > 0) {
      entries.push({
        url: url(`/universities/${countrySlug}/${u.slug}`),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }
  return entries;
}

async function mentorEntries(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const rows = await db
    .select({ slug: mentorProfiles.slug, updatedAt: mentorProfiles.updatedAt })
    .from(mentorProfiles)
    .where(and(eq(mentorProfiles.isListed, true), eq(mentorProfiles.searchIndexable, true)));
  return rows.map((r) => ({
    url: url(`/mentors/${r.slug}`),
    lastModified: r.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
}

async function eventEntries(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const events = await listPublicEvents(db, new Date());
  return events.map((e) => ({
    url: url(`/events/${e.slug}`),
    changeFrequency: "daily",
    priority: 0.5,
  }));
}

async function guideEntries(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const { articles } = await listPublishedArticles(db, { limit: 50_000, offset: 0 });
  return articles.map((a) => ({
    url: url(`/guides/${a.slug}`),
    lastModified: a.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const kind = KINDS[Number(await id)];
  switch (kind) {
    case "static":
      return staticEntries();
    case "career":
      return careerEntries();
    case "study-abroad":
      return studyAbroadEntries();
    case "universities":
      return universityEntries();
    case "mentors":
      return mentorEntries();
    case "events":
      return eventEntries();
    case "guides":
      return guideEntries();
    default:
      return [];
  }
}

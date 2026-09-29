import { sql } from "drizzle-orm";
import { PREVIEW_ACCOUNTS, PREVIEW_PERSONA } from "@/config/preview";
import { getDb } from "@/server/platform/db/client";

/**
 * `generateStaticParams` for each dynamic route of the GitHub Pages preview (docs/19 Phase 15e).
 * `scripts/preview/build.mjs` re-exports these from the routes in its build copy; a real build
 * never imports this file. Each list is what the preview's own pages can link to.
 */

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const db = await getDb();
  return (await db.execute(query)) as unknown as T[];
}

export const mentorParams = () =>
  rows<{ slug: string }>(sql`select slug from app.mentor_profiles where is_listed`);

export const eventParams = () =>
  rows<{ slug: string }>(sql`
    select e.slug from app.event_details e
    join app.sessions s on s.id = e.session_id
    where e.visibility = 'public'
  `);

export const guideParams = () =>
  rows<{ slug: string }>(sql`select slug from app.articles where status = 'published'`);

export const guideCountryParams = () =>
  rows<{ country: string }>(sql`
    select distinct c.slug as country from app.countries c
    where c.study_abroad_enabled
       or c.iso2 in (select country_iso2 from app.articles where status = 'published')
  `);

export const careerParams = () =>
  rows<{ category: string }>(
    sql`select slug as category from app.taxonomy_terms where vocabulary = 'category'`,
  );

export const studyAbroadCountryParams = () =>
  rows<{ country: string }>(
    sql`select slug as country from app.countries where study_abroad_enabled`,
  );

export const cityParams = () =>
  rows<{ country: string; city: string }>(sql`
    select c.slug as country, ci.slug as city from app.cities ci
    join app.countries c on c.iso2 = ci.country_iso2
    where c.study_abroad_enabled
  `);

export const universityParams = () =>
  rows<{ country: string; university: string }>(sql`
    select c.slug as country, u.slug as university from app.universities u
    join app.countries c on c.iso2 = u.country_iso2
  `);

/** Every booking the persona can open: as a student, and as the host of any session. */
export const bookingParams = () =>
  rows<{ id: string }>(sql`
    select b.id::text as id from app.bookings b
    join app.sessions s on s.id = b.session_id
    join app.users u on u.email = ${`${PREVIEW_ACCOUNTS[PREVIEW_PERSONA].key}@example.com`}
    where b.student_id = u.id or s.host_user_id = u.id
  `);

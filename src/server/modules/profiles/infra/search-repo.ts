import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { mentorSearchDocuments } from "./tables";

export type SearchDocumentInput = {
  mentorUserId: string;
  isListed: boolean;
  countryIso2: string | null;
  universityIds: string[];
  companyIds: string[];
  categoryIds: string[];
  languageIds: string[];
  /** Raw text (headline, bio, affiliation and expertise names); the tsvector is derived from this. */
  searchText: string;
};

/** Rebuilds one mentor's search document (docs/19 Phase 6). Called after any change to listed facts. */
export async function upsertSearchDocument(
  executor: Executor,
  input: SearchDocumentInput,
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO app.mentor_search_documents
      (mentor_user_id, is_listed, country_iso2, university_ids, company_ids, category_ids, language_ids, tsv, updated_at)
    VALUES (
      ${input.mentorUserId},
      ${input.isListed},
      ${input.countryIso2},
      ${sql`ARRAY[${sql.join(
        input.universityIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`},
      ${sql`ARRAY[${sql.join(
        input.companyIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`},
      ${sql`ARRAY[${sql.join(
        input.categoryIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`},
      ${sql`ARRAY[${sql.join(
        input.languageIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`},
      to_tsvector('english', ${input.searchText}),
      now()
    )
    ON CONFLICT (mentor_user_id) DO UPDATE SET
      is_listed = excluded.is_listed,
      country_iso2 = excluded.country_iso2,
      university_ids = excluded.university_ids,
      company_ids = excluded.company_ids,
      category_ids = excluded.category_ids,
      language_ids = excluded.language_ids,
      tsv = excluded.tsv,
      updated_at = now()
  `);
}

export type SearchFilters = {
  q?: string;
  universityId?: string;
  companyId?: string;
  categoryId?: string;
  languageId?: string;
  countryIso2?: string;
  limit: number;
  offset: number;
};

export type SearchResult = { mentorUserId: string; countryIso2: string | null; total: number };

/** Public explore query (docs/01 §5.3): listed mentors only, filtered and keyword-ranked. */
export async function searchMentors(
  executor: Executor,
  filters: SearchFilters,
): Promise<SearchResult[]> {
  const conditions: SQL[] = [eq(mentorSearchDocuments.isListed, true)];
  if (filters.q?.trim()) {
    conditions.push(
      sql`${mentorSearchDocuments.tsv} @@ plainto_tsquery('english', ${filters.q.trim()})`,
    );
  }
  if (filters.universityId) {
    conditions.push(
      sql`${filters.universityId}::uuid = ANY(${mentorSearchDocuments.universityIds})`,
    );
  }
  if (filters.companyId) {
    conditions.push(sql`${filters.companyId}::uuid = ANY(${mentorSearchDocuments.companyIds})`);
  }
  if (filters.categoryId) {
    conditions.push(sql`${filters.categoryId}::uuid = ANY(${mentorSearchDocuments.categoryIds})`);
  }
  if (filters.languageId) {
    conditions.push(sql`${filters.languageId}::uuid = ANY(${mentorSearchDocuments.languageIds})`);
  }
  if (filters.countryIso2) {
    conditions.push(eq(mentorSearchDocuments.countryIso2, filters.countryIso2));
  }

  const rows = await executor
    .select({
      mentorUserId: mentorSearchDocuments.mentorUserId,
      countryIso2: mentorSearchDocuments.countryIso2,
      total: sql<number>`count(*) over ()`,
    })
    .from(mentorSearchDocuments)
    .where(and(...conditions))
    .orderBy(desc(mentorSearchDocuments.updatedAt))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows.map((row) => ({
    mentorUserId: row.mentorUserId,
    countryIso2: row.countryIso2,
    total: Number(row.total),
  }));
}

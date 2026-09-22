import { and, eq } from "drizzle-orm";
import isoCountries from "i18n-iso-countries";
import type { Executor } from "../client";
import { countries, currencies, taxonomyTerms, type TaxonomyVocabulary } from "../tables/reference";
import { cities, companies, companyDomains, universities, universityDomains } from "../tables/geo";
import { newId } from "../../ids";
import { CATEGORY_TREE, LANGUAGE_TERMS, type TaxonomySeedNode } from "./taxonomy-data";
import { CITY_SEEDS, COMPANY_SEEDS, UNIVERSITY_SEEDS } from "./geo-data";

export const SEED_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "SEK",
  "NZD",
  "SGD",
  "CHF",
  "JPY",
  "AED",
] as const;

/** Destination countries enabled at launch (brief §3); admins can enable more. */
export const STUDY_ABROAD_COUNTRIES = [
  "DE",
  "US",
  "GB",
  "CA",
  "AU",
  "NL",
  "IE",
  "FR",
  "SE",
  "FI",
] as const;

const DEFAULT_CURRENCY_BY_COUNTRY: Record<string, (typeof SEED_CURRENCIES)[number]> = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  SE: "SEK",
  NZ: "NZD",
  SG: "SGD",
  CH: "CHF",
  JP: "JPY",
  AE: "AED",
  DE: "EUR",
  NL: "EUR",
  IE: "EUR",
  FR: "EUR",
  FI: "EUR",
  AT: "EUR",
  BE: "EUR",
  ES: "EUR",
  IT: "EUR",
  PT: "EUR",
};

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildCurrencySeed() {
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  return SEED_CURRENCIES.map((code) => ({
    code,
    name: names.of(code) ?? code,
    minorUnit:
      new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2,
  }));
}

export function buildCountrySeed() {
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  const alpha2ToAlpha3 = isoCountries.getAlpha2Codes();
  const seen = new Set<string>();
  return Object.entries(alpha2ToAlpha3)
    .map(([iso2, iso3]) => {
      const name = regionNames.of(iso2) ?? iso2;
      let slug = slugify(name);
      if (seen.has(slug)) slug = `${slug}-${iso2.toLowerCase()}`;
      seen.add(slug);
      return {
        iso2,
        iso3,
        numericCode: isoCountries.alpha2ToNumeric(iso2) ?? null,
        name,
        slug,
        defaultCurrency: DEFAULT_CURRENCY_BY_COUNTRY[iso2] ?? null,
        studyAbroadEnabled: (STUDY_ABROAD_COUNTRIES as readonly string[]).includes(iso2),
      };
    })
    .sort((a, b) => a.iso2.localeCompare(b.iso2));
}

async function insertMissingTaxonomyNodes(
  executor: Executor,
  vocabulary: TaxonomyVocabulary,
  nodes: TaxonomySeedNode[],
  parentId: string | null,
): Promise<number> {
  let inserted = 0;
  for (const [index, node] of nodes.entries()) {
    const rows = await executor
      .insert(taxonomyTerms)
      .values({
        id: newId(),
        vocabulary,
        parentId,
        slug: node.slug,
        name: node.name,
        flags: node.flags ?? {},
        sortOrder: index,
      })
      .onConflictDoNothing({ target: [taxonomyTerms.vocabulary, taxonomyTerms.slug] })
      .returning({ id: taxonomyTerms.id });
    if (rows.length > 0) inserted += 1;
    const [term] = await executor
      .select({ id: taxonomyTerms.id })
      .from(taxonomyTerms)
      .where(and(eq(taxonomyTerms.vocabulary, vocabulary), eq(taxonomyTerms.slug, node.slug)));
    if (node.children?.length && term)
      inserted += await insertMissingTaxonomyNodes(executor, vocabulary, node.children, term.id);
  }
  return inserted;
}

async function seedGeoData(
  executor: Executor,
): Promise<{ cities: number; universities: number; companies: number }> {
  const cityRows = await executor
    .insert(cities)
    .values(
      CITY_SEEDS.map((c) => ({
        id: newId(),
        countryIso2: c.countryIso2,
        name: c.name,
        slug: c.slug,
      })),
    )
    .onConflictDoNothing({ target: [cities.countryIso2, cities.slug] })
    .returning({ id: cities.id });

  const cityIdBySlug = new Map<string, string>();
  const allCities = await executor
    .select({ id: cities.id, slug: cities.slug, countryIso2: cities.countryIso2 })
    .from(cities);
  for (const row of allCities) cityIdBySlug.set(`${row.countryIso2}:${row.slug}`, row.id);

  let universityCount = 0;
  for (const uni of UNIVERSITY_SEEDS) {
    const cityId = cityIdBySlug.get(`${uni.countryIso2}:${uni.citySlug}`) ?? null;
    const rows = await executor
      .insert(universities)
      .values({
        id: newId(),
        name: uni.name,
        slug: uni.slug,
        countryIso2: uni.countryIso2,
        cityId,
        website: uni.website,
      })
      .onConflictDoNothing({ target: [universities.countryIso2, universities.slug] })
      .returning({ id: universities.id });
    if (rows.length > 0) universityCount += 1;

    const [university] = await executor
      .select({ id: universities.id })
      .from(universities)
      .where(and(eq(universities.countryIso2, uni.countryIso2), eq(universities.slug, uni.slug)));
    if (!university) continue;
    for (const d of uni.domains) {
      await executor
        .insert(universityDomains)
        .values({ id: newId(), universityId: university.id, domain: d.domain, kind: d.kind })
        .onConflictDoNothing({ target: universityDomains.domain });
    }
  }

  let companyCount = 0;
  for (const company of COMPANY_SEEDS) {
    const rows = await executor
      .insert(companies)
      .values({ id: newId(), name: company.name, slug: company.slug, website: company.website })
      .onConflictDoNothing({ target: companies.slug })
      .returning({ id: companies.id });
    if (rows.length > 0) companyCount += 1;

    const [companyRow] = await executor
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, company.slug));
    if (!companyRow) continue;
    for (const domain of company.domains) {
      await executor
        .insert(companyDomains)
        .values({ id: newId(), companyId: companyRow.id, domain })
        .onConflictDoNothing({ target: companyDomains.domain });
    }
  }

  return { cities: cityRows.length, universities: universityCount, companies: companyCount };
}

export type SeedSummary = {
  currencies: number;
  countries: number;
  taxonomyTerms: number;
  cities: number;
  universities: number;
  companies: number;
};

/**
 * Idempotent reference-data seed. Inserts missing rows only; never overwrites values admins may
 * have changed (names, flags, enablement).
 */
export async function seedReferenceData(executor: Executor): Promise<SeedSummary> {
  const currencyRows = await executor
    .insert(currencies)
    .values(buildCurrencySeed())
    .onConflictDoNothing({ target: currencies.code })
    .returning({ code: currencies.code });

  const countryRows = await executor
    .insert(countries)
    .values(buildCountrySeed())
    .onConflictDoNothing({ target: countries.iso2 })
    .returning({ iso2: countries.iso2 });

  const taxonomyCount =
    (await insertMissingTaxonomyNodes(executor, "category", CATEGORY_TREE, null)) +
    (await insertMissingTaxonomyNodes(executor, "language", LANGUAGE_TERMS, null));
  const geo = await seedGeoData(executor);
  return {
    currencies: currencyRows.length,
    countries: countryRows.length,
    taxonomyTerms: taxonomyCount,
    ...geo,
  };
}

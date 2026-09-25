/** Lowercase, hyphenated slug (docs/22 §10.1). Duplicated from other modules' `domain/slug.ts` — a
 * tiny pure function, and modules only ever import each other's public index (never another
 * module's `domain/*`), so this one lives independently rather than creating a cross-module
 * dependency. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

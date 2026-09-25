import { sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// Allows a single embedded dot so dotted enum values (e.g. `Capability`'s `"booking.create"`,
// docs/10 §7.3) can go through `checkIn` too, not just plain snake_case values.
const SAFE_TOKEN = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/** Case-insensitive text (extension enabled in 0000_extensions.sql). Used for emails. */
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

/** Full-text search vector, precomputed and stored (not generated per-query). Used with a GIN index. */
export const tsvectorColumn = customType<{ data: string }>({
  dataType: () => "tsvector",
});

/**
 * Half-open UTC instant range (`[start, end)`), stored as `tstzrange` so a GiST exclusion
 * constraint can guarantee no double-booking at the database layer (docs/05 §4.1). Drizzle has no
 * first-class range type, so this models it as text; Postgres accepts the bracket literal on
 * write and returns it unquoted on read since our bounds never contain a comma or parenthesis.
 */
export const tstzrangeColumn = customType<{ data: string }>({
  dataType: () => "tstzrange",
});

export function toTstzRange(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`;
}

/** Inverse of {@link toTstzRange}: parses the literal Postgres returns for a `tstzrange` column. */
export function parseTstzRange(raw: string): { start: Date; end: Date } {
  const match = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(raw.trim());
  if (!match) throw new Error(`Unparseable tstzrange literal: ${raw}`);
  const [, startRaw, endRaw] = match;
  return { start: new Date(startRaw!), end: new Date(endRaw!) };
}

/**
 * `column IN ('a', 'b')` for CHECK constraints built from compile-time constant enums. Every token is
 * validated, so this can never carry user input; runtime values must use parameterized sql`` instead.
 */
export function checkIn(columnName: string, values: readonly string[]): SQL {
  for (const token of [columnName, ...values]) {
    if (!SAFE_TOKEN.test(token)) throw new Error(`Unsafe token in checkIn: ${token}`);
  }
  // eslint-disable-next-line no-restricted-syntax -- validated constant enum values only (see above)
  return sql.raw(`${columnName} IN (${values.map((value) => `'${value}'`).join(", ")})`);
}

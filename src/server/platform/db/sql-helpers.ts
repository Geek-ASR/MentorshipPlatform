import { sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

const SAFE_TOKEN = /^[a-z_][a-z0-9_]*$/;

/** Case-insensitive text (extension enabled in 0000_extensions.sql). Used for emails. */
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

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

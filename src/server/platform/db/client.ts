import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

/*
 * Note: Drizzle's postgres-js driver disables postgres.js date serialization, so raw `sql` templates
 * must pass timestamps as ISO strings with an explicit cast: `${date.toISOString()}::timestamptz`
 * (enforced by tests/architecture).
 */

export type Schema = typeof schema;

export type Database = PostgresJsDatabase<Schema> & { $client: postgres.Sql };

/** Either the database or an open transaction. Services accept this so callers control atomicity. */
export type Executor = PgDatabase<
  PostgresJsQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

export type DatabaseOptions = {
  url: string;
  maxConnections?: number;
  /** Must be false behind transaction-mode poolers (e.g. Supabase Supavisor on port 6543). */
  preparedStatements?: boolean;
  applicationName?: string;
};

export function createDatabase(options: DatabaseOptions): Database {
  const client = postgres(options.url, {
    max: options.maxConnections ?? 5,
    prepare: options.preparedStatements ?? true,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    connection: { application_name: options.applicationName ?? "aheadly-web" },
  });
  return drizzle({ client, schema });
}

export async function closeDatabase(db: Database): Promise<void> {
  await db.$client.end({ timeout: 5 });
}

const globalForDb = globalThis as typeof globalThis & { __aheadlyDb?: Database };

/** Process-wide database for the running app. Cached on globalThis so dev hot-reloads reuse the pool. */
export async function getDb(): Promise<Database> {
  if (!globalForDb.__aheadlyDb) {
    const { getEnv } = await import("@/config/env");
    const env = getEnv();
    globalForDb.__aheadlyDb = createDatabase({
      url: env.DATABASE_URL,
      maxConnections: env.DATABASE_POOL_MAX,
      preparedStatements: env.DATABASE_PREPARED_STATEMENTS,
    });
  }
  return globalForDb.__aheadlyDb;
}

/** Returns true when a Postgres error has the given SQLSTATE (e.g. 23505 unique, 23P01 exclusion). */
export function hasSqlState(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      current.code === code
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? current.cause
        : undefined;
  }
  return false;
}

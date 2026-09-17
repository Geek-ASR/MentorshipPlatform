import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { closeDatabase, createDatabase } from "./client";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

/** Applies pending migrations using a dedicated single connection. */
export async function runMigrations(url: string): Promise<void> {
  const db = createDatabase({ url, maxConnections: 1, applicationName: "aheadly-migrator" });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: "drizzle" });
  } finally {
    await closeDatabase(db);
  }
}

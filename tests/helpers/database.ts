import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { closeDatabase, createDatabase, type Database } from "@/server/platform/db/client";

export const TEMPLATE_DATABASE = "aheadly_test_template";

export function adminUrl(): string {
  if (!process.env.TEST_DATABASE_ADMIN_URL && existsSync(".env.local"))
    process.loadEnvFile(".env.local");
  return process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres@localhost:5432/postgres";
}

export function urlForDatabase(name: string): string {
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

export type TestDatabase = {
  db: Database;
  url: string;
  name: string;
  dispose: () => Promise<void>;
};

/** Creates an isolated database cloned from the migrated + seeded template. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `aheadly_test_${process.pid}_${randomBytes(4).toString("hex")}`;
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DATABASE}"`);
        break;
      } catch (error) {
        // Parallel clones of one template can briefly collide; retry.
        if (attempt >= 10 || !String(error).includes("being accessed by other users")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      }
    }
  } finally {
    await admin.end();
  }
  const url = urlForDatabase(name);
  const db = createDatabase({ url, maxConnections: 20, applicationName: "aheadly-tests" });
  return {
    db,
    url,
    name,
    dispose: async () => {
      await closeDatabase(db);
      const cleanup = postgres(adminUrl(), { max: 1, onnotice: () => {} });
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

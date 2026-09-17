import postgres from "postgres";
import { runMigrations } from "@/server/platform/db/migrate";
import { closeDatabase, createDatabase } from "@/server/platform/db/client";
import { seedReferenceData } from "@/server/platform/db/seed/seed";
import { adminUrl, TEMPLATE_DATABASE, urlForDatabase } from "./database";

async function dropStaleTestDatabases(admin: postgres.Sql) {
  const rows = await admin<
    { datname: string }[]
  >`select datname from pg_database where datname like 'aheadly_test_%'`;
  for (const { datname } of rows) {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  }
}

/** Builds a fresh, migrated and seeded template database once per test run. */
export default async function setup() {
  const admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  try {
    await dropStaleTestDatabases(admin);
    await admin.unsafe(`CREATE DATABASE "${TEMPLATE_DATABASE}"`);
  } finally {
    await admin.end();
  }

  const templateUrl = urlForDatabase(TEMPLATE_DATABASE);
  await runMigrations(templateUrl);
  const db = createDatabase({ url: templateUrl, maxConnections: 1 });
  try {
    await db.transaction((tx) => seedReferenceData(tx));
  } finally {
    await closeDatabase(db);
  }

  return async () => {
    const cleanup = postgres(adminUrl(), { max: 1, onnotice: () => {} });
    try {
      await dropStaleTestDatabases(cleanup);
    } finally {
      await cleanup.end();
    }
  };
}

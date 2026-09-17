import { closeDatabase, createDatabase } from "../../src/server/platform/db/client";
import { seedReferenceData } from "../../src/server/platform/db/seed/seed";
import { loadLocalEnv, requireEnv } from "../lib/load-env";

loadLocalEnv();
const db = createDatabase({
  url: requireEnv("DATABASE_URL"),
  maxConnections: 1,
  applicationName: "aheadly-seed",
});
try {
  const summary = await db.transaction((tx) => seedReferenceData(tx));
  console.log(`Seed complete (newly inserted): ${JSON.stringify(summary)}`);
} finally {
  await closeDatabase(db);
}

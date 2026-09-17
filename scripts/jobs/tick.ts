import { systemClock } from "../../src/server/platform/clock";
import { closeDatabase, createDatabase } from "../../src/server/platform/db/client";
import { createLogger } from "../../src/server/platform/logger";
import { runJobTick } from "../../src/server/jobs";
import { loadLocalEnv, requireEnv } from "../lib/load-env";

/** Local/CI fallback for the scheduler: runs one tick directly against the database. */
loadLocalEnv();
const db = createDatabase({
  url: requireEnv("DATABASE_URL"),
  maxConnections: 2,
  applicationName: "aheadly-tick-cli",
});
try {
  const result = await runJobTick(db, {
    clock: systemClock,
    logger: createLogger({ level: "info" }),
  });
  console.log(JSON.stringify(result));
} finally {
  await closeDatabase(db);
}

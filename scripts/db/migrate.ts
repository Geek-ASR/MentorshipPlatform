import { runMigrations } from "../../src/server/platform/db/migrate";
import { loadLocalEnv } from "../lib/load-env";

loadLocalEnv();
const url = process.env.DATABASE_MIGRATOR_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_MIGRATOR_URL or DATABASE_URL (see .env.example).");
  process.exit(1);
}

await runMigrations(url);
console.log("Migrations applied.");

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // Table definitions only (not the aggregating schema.ts) to avoid duplicate exports.
  schema: ["./src/server/platform/db/tables/*.ts", "./src/server/modules/*/infra/tables.ts"],
  out: "./drizzle",
  schemaFilter: ["app"],
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL ?? "",
  },
});

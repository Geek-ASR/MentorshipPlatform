import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Test-only configuration. Secrets are random per run so no secret-like literals live in the repo. */
const testEnv = {
  NODE_ENV: "test" as const,
  APP_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://unused-in-unit-tests@localhost:5432/unused",
  JOB_TICK_SECRET: randomBytes(32).toString("base64url"),
  OPS_SECRET: randomBytes(32).toString("base64url"),
};

export default defineConfig({
  resolve: {
    alias: {
      "@/": `${root}src/`,
      "@tests/": `${root}tests/`,
      "server-only": `${root}tests/helpers/empty-module.ts`,
    },
  },
  test: {
    env: testEnv,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "tests/unit/**/*.test.ts",
            "tests/architecture/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/helpers/global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

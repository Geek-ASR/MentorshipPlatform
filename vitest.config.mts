import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Deterministic, non-secret values so config validation passes in tests. */
const testEnv = {
  NODE_ENV: "test" as const,
  APP_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://unused-in-unit-tests@localhost:5432/unused",
  JOB_TICK_SECRET: "test-job-tick-secret-0123456789abcdefghijklmnop",
  OPS_SECRET: "test-ops-secret-0123456789abcdefghijklmnopqrstuv",
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

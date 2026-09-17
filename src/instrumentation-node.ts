import { getEnv } from "./config/env";

/**
 * Validates configuration at startup and exits on failure, so a misconfigured deployment crashes
 * visibly instead of serving 500s. The message names invalid variables but never their values.
 */
try {
  getEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid environment configuration");
  process.exit(1);
}

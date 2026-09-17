import { existsSync } from "node:fs";

/** Loads .env.local then .env (without overriding variables already set in the shell/CI). */
export function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}. See .env.example.`);
    process.exit(1);
  }
  return value;
}

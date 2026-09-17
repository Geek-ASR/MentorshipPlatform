import { z } from "zod";

/**
 * Server environment configuration. Validated once; the app refuses to start when invalid
 * (see src/instrumentation.ts). Error messages name variables but never echo their values.
 *
 * Never import this from client components (enforced by tests/architecture).
 */

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
const secret = z.string().min(32, "must be at least 32 characters of random data");

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "test", "preview", "staging", "production"]).default("local"),
    APP_BASE_URL: z.url({ protocol: /^https?$/ }),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),

    DATABASE_URL: z.string().min(1),
    DATABASE_PREPARED_STATEMENTS: booleanString.default(true),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

    JOB_TICK_SECRET: secret,
    OPS_SECRET: secret,

    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[a-z0-9-]*$/, "must be a lowercase header name")
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === "production" && !env.APP_BASE_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_BASE_URL"],
        message: "must use https in production",
      });
    }
    if (env.JOB_TICK_SECRET === env.OPS_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["OPS_SECRET"],
        message: "must differ from JOB_TICK_SECRET",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(details: string) {
    super(`Invalid environment configuration:\n${details}`);
    this.name = "InvalidEnvironmentError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new InvalidEnvironmentError(details);
  }
  return result.data;
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

/** Test-only: forget the cached environment. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}

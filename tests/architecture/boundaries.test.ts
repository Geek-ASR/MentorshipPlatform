import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture rules from docs/04 §5, ADR-019 and docs/11. These run as fast unit tests so
 * violations fail CI before review.
 */
const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|mts)$/.test(entry) ? [full] : [];
  });
}

const sourceFiles = walk(path.join(ROOT, "src")).map((file) => ({
  file: path.relative(ROOT, file),
  content: readFileSync(file, "utf8"),
}));

const importsOf = (content: string) =>
  [
    ...content.matchAll(
      /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].map((match) => match[1] ?? match[2] ?? "");

describe("architecture boundaries", () => {
  it("client components never import server code or server configuration", () => {
    const violations = sourceFiles
      .filter(({ content }) => /^\s*["']use client["']/m.test(content))
      .flatMap(({ file, content }) =>
        importsOf(content)
          .filter((spec) =>
            /^@\/server\b|^@\/config\/env$|^(postgres|drizzle-orm|pino)(\/|$)|^node:/.test(spec),
          )
          .map((spec) => `${file} imports ${spec}`),
      );
    expect(violations).toEqual([]);
  });

  it("domain layers stay framework- and infrastructure-free", () => {
    const violations = sourceFiles
      .filter(({ file }) => /src\/server\/modules\/[^/]+\/domain\//.test(file))
      .flatMap(({ file, content }) => [
        ...importsOf(content)
          .filter((spec) =>
            /^(next|react|drizzle-orm|postgres|pino)(\/|$)|^@\/server\/platform\/(db|http)|\/(infra|application|http)\//.test(
              spec,
            ),
          )
          .map((spec) => `${file} imports ${spec}`),
        ...(/\bDate\.now\(\)|new Date\(\)/.test(content)
          ? [`${file} reads the system clock (use Clock)`]
          : []),
      ]);
    expect(violations).toEqual([]);
  });

  it("modules depend on each other only through their public index", () => {
    const violations = sourceFiles
      .filter(({ file }) => file.startsWith("src/server/modules/"))
      .flatMap(({ file, content }) => {
        const ownModule = file.split("/")[3];
        return importsOf(content)
          .filter((spec) => {
            const match = /^@\/server\/modules\/([^/]+)\/(.+)$/.exec(spec);
            return match !== null && match[1] !== ownModule;
          })
          .map((spec) => `${file} deep-imports ${spec}`);
      });
    expect(violations).toEqual([]);
  });

  it("does not use Server Actions (mutations go through REST handlers, ADR-019)", () => {
    const violations = sourceFiles
      .filter(({ content }) => /^\s*["']use server["']/m.test(content))
      .map(({ file }) => file);
    expect(violations).toEqual([]);
  });

  it("only exposes allowlisted NEXT_PUBLIC_ variables", () => {
    const allowed = new Set([
      "NEXT_PUBLIC_APP_BASE_URL",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "NEXT_PUBLIC_SENTRY_DSN",
      "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    ]);
    const used = sourceFiles.flatMap(({ file, content }) =>
      [...content.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)].map((match) => ({ file, name: match[0] })),
    );
    expect(used.filter(({ name }) => !allowed.has(name))).toEqual([]);
  });

  it("passes timestamps to raw SQL as ISO strings (driver date serialization is disabled)", () => {
    const violations = sourceFiles.flatMap(({ file, content }) =>
      [...content.matchAll(/\$\{([^}]+)\}::timestamptz/g)]
        .filter((match) => !match[1]!.includes("toISOString()"))
        .map((match) => `${file}: \${${match[1]}}::timestamptz`),
    );
    expect(violations).toEqual([]);
  });

  it("confines sql.raw to the validated constant helper", () => {
    const violations = sourceFiles
      .filter(({ file }) => file !== "src/server/platform/db/sql-helpers.ts")
      .flatMap(({ file, content }) =>
        [...content.matchAll(/sql\.raw\(/g)].map(
          (match) => `${file}: sql.raw at offset ${match.index}`,
        ),
      );
    expect(violations).toEqual([]);
  });
});

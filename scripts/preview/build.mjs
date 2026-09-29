#!/usr/bin/env node
/**
 * Builds the GitHub Pages preview of the whole UI (docs/19 Phase 15e) into `dist-pages/`:
 * the student view at the root and the mentor view under `as-mentor/`, both rendered from the
 * seeded demo database (`npm run db:seed:demo`) and exported as static files.
 *
 * A static host has no server, so the build works on a copy of the app with the parts that need
 * one removed — the API, the staff console, checkout, the sitemap — `revalidate` stripped, and
 * `generateStaticParams` added to dynamic routes (`src/preview/static-params.ts`). What the
 * browser reads from the API is captured beforehand by `snapshot.ts`. The repo itself is untouched.
 *
 *   PREVIEW_ROOT=/MentorshipPlatform node scripts/preview/build.mjs
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "../..");
const work = path.join(repo, ".preview", "work");
const dist = path.join(repo, "dist-pages");
const previewRoot = process.env.PREVIEW_ROOT ?? "/MentorshipPlatform";

/** Just the app: tests, scripts and docs would be type-checked by `next build` and don't belong. */
const APP_FILES = [
  "src",
  "public",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "package.json",
  ".env.local",
];

/** Route directory → the params function in `src/preview/static-params.ts`. */
const DYNAMIC_ROUTES = {
  "src/app/(public)/mentors/[slug]": "mentorParams",
  "src/app/(public)/events/[slug]": "eventParams",
  "src/app/(public)/guides/[slug]": "guideParams",
  "src/app/(public)/guides/country/[country]": "guideCountryParams",
  "src/app/(public)/career/[category]": "careerParams",
  "src/app/(public)/study-abroad/[country]": "studyAbroadCountryParams",
  "src/app/(public)/study-abroad/[country]/[city]": "cityParams",
  "src/app/(public)/universities/[country]/[university]": "universityParams",
  "src/app/dashboard/bookings/[id]": "bookingParams",
};

function run(command, args, { cwd = work, env = {} } = {}) {
  execFileSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

function edit(file, change) {
  const before = readFileSync(file, "utf8");
  const after = change(before);
  if (after !== before) writeFileSync(file, after);
}

// 1. A copy of the app, sharing the installed dependencies.
rmSync(path.join(repo, ".preview"), { recursive: true, force: true });
mkdirSync(work, { recursive: true });
for (const name of APP_FILES) {
  if (existsSync(path.join(repo, name))) {
    cpSync(path.join(repo, name), path.join(work, name), { recursive: true });
  }
}
symlinkSync(path.join(repo, "node_modules"), path.join(work, "node_modules"), "dir");

// 2. Remove what needs a server; keep the preview out of search engines.
for (const gone of ["src/app/api", "src/app/admin", "src/app/checkout", "src/app/sitemap.ts"]) {
  rmSync(path.join(work, gone), { recursive: true, force: true });
}
writeFileSync(
  path.join(work, "src/app/robots.ts"),
  `import type { MetadataRoute } from "next";\n\nexport const dynamic = "force-static";\n\nexport default function robots(): MetadataRoute.Robots {\n  return { rules: { userAgent: "*", disallow: "/" } };\n}\n`,
);

// Generated social images are rendered per request; a static preview doesn't need them.
function removeGeneratedImages(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) removeGeneratedImages(full);
    else if (/^(opengraph|twitter)-image\.tsx?$/.test(name)) rmSync(full);
  }
}
removeGeneratedImages(path.join(work, "src/app"));

// 3. Static-only page config: no ISR, no query strings, every dynamic path listed up front.
for (const file of pages(path.join(work, "src/app"))) {
  edit(file, (source) =>
    source
      .replace(/^export const revalidate = \d+;\n/m, "")
      .replaceAll("await searchParams", "({} as Awaited<typeof searchParams>)"),
  );
}
for (const [dir, fn] of Object.entries(DYNAMIC_ROUTES)) {
  edit(
    path.join(work, dir, "page.tsx"),
    (source) =>
      `${source}\nimport { ${fn} as previewParams } from "@/preview/static-params";\n` +
      `export const dynamicParams = false;\n` +
      `export function generateStaticParams() {\n  return previewParams();\n}\n`,
  );
}

// 4. One export per persona.
rmSync(dist, { recursive: true, force: true });
for (const persona of ["student", "mentor"]) {
  const basePath = persona === "student" ? previewRoot : `${previewRoot}/as-mentor`;
  const apiDir = path.join(work, "public", "preview-api");
  rmSync(apiDir, { recursive: true, force: true });
  rmSync(path.join(work, ".next"), { recursive: true, force: true });
  rmSync(path.join(work, "out"), { recursive: true, force: true });
  // Snapshots come from the repo's real route handlers, which the copy no longer has.
  run("npx", ["tsx", "scripts/preview/snapshot.ts", apiDir, persona], { cwd: repo });
  run("npx", ["next", "build"], {
    env: {
      NEXT_PUBLIC_PREVIEW: "1",
      NEXT_PUBLIC_PREVIEW_PERSONA: persona,
      NEXT_PUBLIC_BASE_PATH: basePath,
      NEXT_PUBLIC_PREVIEW_ROOT: previewRoot,
    },
  });
  const target = persona === "student" ? dist : path.join(dist, "as-mentor");
  mkdirSync(target, { recursive: true });
  cpSync(path.join(work, "out"), target, { recursive: true });
}

// GitHub Pages runs Jekyll unless told not to, and Jekyll drops Next's `_next/` folder.
writeFileSync(path.join(dist, ".nojekyll"), "");
if (!existsSync(path.join(dist, "index.html"))) throw new Error("preview export produced no index");
console.log(`Preview written to ${path.relative(repo, dist)}/ (student) and as-mentor/ (mentor).`);

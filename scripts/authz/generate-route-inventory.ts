import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * docs/13 §5: "a generated test suite enumerates every route with a path parameter or resource body
 * reference... The matrix is a CI gate: a new route without matrix entries fails the build." Building
 * the full per-route × per-actor expected-response matrix for all ~137 routes in one pass is a much
 * bigger undertaking than this phase's remaining scope (docs/19 Phase 13 retrospective) — what this
 * script builds is the real, working first half of that mechanism: a complete, generated inventory of
 * every route, its declared `defineRoute` metadata (`name`, `actor` resolution mode), and whether an
 * `authorize()`/`requireStaff`/`requireAnyRole`/`requireRecentUserAuth` call is visible directly in
 * the route file (a static, best-effort signal, not a guarantee — many routes correctly delegate
 * authorization into an application-layer service function this scan can't see into). Paired with
 * `tests/authz/route-inventory.test.ts`, which fails CI the moment this generated inventory drifts
 * from the committed snapshot, so a new or changed route can never silently go unreviewed.
 *
 * Per-role expected-response assertions (docs/13 §5's actor table: anonymous/owner/other
 * student/moderator/etc.) remain a real, acknowledged carry — this generator's job is only to make
 * every route impossible to add without a human looking at it, which it does today.
 */

const APP_ROOT = join(process.cwd(), "src/app");
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteEntry = {
  method: HttpMethod;
  path: string;
  file: string;
  name: string | null;
  actorMode: "resolve" | "none" | null;
  hasVisibleAuthzCall: boolean;
};

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

/** `src/app/api/v1/bookings/[id]/route.ts` -> `/api/v1/bookings/:id` */
function pathFromFile(file: string): string {
  const rel = relative(APP_ROOT, file).split(sep).slice(0, -1); // drop "route.ts"
  const segments = rel.map((segment) => {
    if (segment.startsWith("[...") && segment.endsWith("]")) return "*";
    if (segment.startsWith("[") && segment.endsWith("]")) return `:${segment.slice(1, -1)}`;
    return segment;
  });
  return `/${segments.join("/")}`;
}

/** Walks forward from an opening `{` at `source[openIndex]`, returning the matching `}` index. */
function matchingBraceIndex(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced braces starting at index ${openIndex}`);
}

type DefineRouteCall = {
  identifier: string;
  exportedMethod: HttpMethod | null;
  optionsText: string;
};

function findDefineRouteCalls(source: string): DefineRouteCall[] {
  const calls: DefineRouteCall[] = [];
  // Captures either `export const GET = defineRoute({` (both groups) or a bare
  // `const helper = defineRoute({` used by a re-exported handler (identifier only).
  const callPattern =
    /(?:export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*|const\s+(\w+)\s*=\s*)?defineRoute\(\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(source))) {
    const openBraceIndex = match.index + match[0].length - 1;
    const closeBraceIndex = matchingBraceIndex(source, openBraceIndex);
    calls.push({
      identifier: match[2] ?? "",
      exportedMethod: (match[1] as HttpMethod | undefined) ?? null,
      optionsText: source.slice(openBraceIndex, closeBraceIndex + 1),
    });
  }
  return calls;
}

function extractStringField(optionsText: string, field: string): string | null {
  const match = new RegExp(`${field}\\s*:\\s*"([^"]*)"`).exec(optionsText);
  return match ? match[1]! : null;
}

function hasVisibleAuthz(source: string): boolean {
  return /\bauthorize\(|\brequireStaff\w*\(|\brequireAnyRole\(|\brequireRecentUserAuth\(/.test(
    source,
  );
}

export function buildInventory(): RouteEntry[] {
  const files = findRouteFiles(APP_ROOT).sort();
  const entries: RouteEntry[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const path = pathFromFile(file);
    const authzVisible = hasVisibleAuthz(source);
    const defineRouteCalls = findDefineRouteCalls(source);
    const byIdentifier = new Map(
      defineRouteCalls.filter((c) => c.identifier).map((c) => [c.identifier, c]),
    );

    // Direct: `export const GET = defineRoute({ ... }, ...)`.
    for (const call of defineRouteCalls) {
      if (!call.exportedMethod) continue;
      entries.push({
        method: call.exportedMethod,
        path,
        file: relative(process.cwd(), file),
        name: extractStringField(call.optionsText, "name"),
        actorMode: extractStringField(call.optionsText, "actor") as "resolve" | "none" | null,
        hasVisibleAuthzCall: authzVisible,
      });
    }

    // Re-export: `export { notFound as GET, notFound as POST, ... }`.
    const reExportBlock = /export\s*\{([^}]*)\}/.exec(source);
    if (reExportBlock) {
      for (const clause of reExportBlock[1]!.split(",")) {
        const asMatch = /(\w+)\s+as\s+(GET|POST|PUT|PATCH|DELETE)/.exec(clause);
        if (!asMatch) continue;
        const [, identifier, method] = asMatch as unknown as [string, string, HttpMethod];
        if (entries.some((e) => e.method === method && e.path === path)) continue; // already direct
        const call = byIdentifier.get(identifier);
        entries.push({
          method: method as HttpMethod,
          path,
          file: relative(process.cwd(), file),
          name: call ? extractStringField(call.optionsText, "name") : null,
          actorMode: call
            ? (extractStringField(call.optionsText, "actor") as "resolve" | "none" | null)
            : null,
          hasVisibleAuthzCall: authzVisible,
        });
      }
    }
  }

  return entries.sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
}

export const INVENTORY_PATH = join(process.cwd(), "tests/authz/route-inventory.json");

function main(): void {
  const inventory = buildInventory();
  writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2) + "\n");
  console.log(
    `Wrote ${inventory.length} route entries to ${relative(process.cwd(), INVENTORY_PATH)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

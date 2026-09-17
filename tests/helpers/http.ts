import type { Database } from "@/server/platform/db/client";

export const BASE_URL = "http://localhost:3000";

/** Points the app's lazy database singleton at a test database. */
export function useDatabaseForRoutes(db: Database): void {
  (globalThis as typeof globalThis & { __aheadlyDb?: Database }).__aheadlyDb = db;
}

export function routeContext(params: Record<string, string | string[]> = {}) {
  return { params: Promise.resolve(params) };
}

export function jsonRequest(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    rawBody?: string;
  } = {},
): Request {
  const method = init.method ?? "POST";
  const hasBody = init.body !== undefined || init.rawBody !== undefined;
  return new Request(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      origin: BASE_URL,
      "sec-fetch-site": "same-origin",
      ...init.headers,
    },
    body: init.rawBody ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
}

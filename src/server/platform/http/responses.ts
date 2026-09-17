import { toProblem } from "../errors";

export const NO_STORE = "no-store";

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string>; requestId?: string } = {},
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": NO_STORE,
    ...init.headers,
  });
  if (init.requestId) headers.set("x-request-id", init.requestId);
  return new Response(init.status === 204 ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

export function problemResponse(
  error: unknown,
  context: { instance?: string; requestId?: string },
): Response {
  const problem = toProblem(error, context);
  const headers = new Headers({
    "content-type": "application/problem+json; charset=utf-8",
    "cache-control": NO_STORE,
  });
  if (context.requestId) headers.set("x-request-id", context.requestId);
  if (typeof error === "object" && error !== null && "headers" in error && error.headers) {
    for (const [key, value] of Object.entries(error.headers as Record<string, string>))
      headers.set(key, value);
  }
  return new Response(JSON.stringify(problem), { status: problem.status, headers });
}

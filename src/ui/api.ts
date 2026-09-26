/**
 * Browser client for the REST API (ADR-019: every mutation goes through a `defineRoute` handler).
 * Adds an idempotency key to every non-GET request and turns RFC 9457 problem+json responses into
 * a typed `ApiError` carrying the field errors and request id the UI needs (docs/22 §4: human
 * message, retry, and a small copyable reference — never raw errors).
 */

export type FieldError = { path: string; code: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly title: string | undefined;
  readonly detail: string | undefined;
  readonly errors: FieldError[];
  readonly requestId: string | undefined;
  readonly extensions: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown> | null, requestId?: string) {
    const detail = typeof body?.detail === "string" ? body.detail : undefined;
    const title = typeof body?.title === "string" ? body.title : undefined;
    super(detail ?? title ?? fallbackMessage(status));
    this.status = status;
    this.code = typeof body?.code === "string" ? body.code : undefined;
    this.title = title;
    this.detail = detail;
    this.errors = Array.isArray(body?.errors) ? (body.errors as FieldError[]) : [];
    this.requestId =
      requestId ?? (typeof body?.requestId === "string" ? body.requestId : undefined);
    this.extensions = body ?? {};
  }

  /** First message per field, e.g. `{ password: "Use at least 10 characters." }` — schema errors
   * arrive as `body.password`, domain errors as `password`; both map to the same key. */
  fieldErrors(): Record<string, string> {
    const byPath: Record<string, string> = {};
    for (const error of this.errors) {
      byPath[error.path.replace(/^(body|query|params)\./, "")] ??= error.message;
    }
    return byPath;
  }
}

function fallbackMessage(status: number): string {
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "Something went wrong. Please try again.";
}

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T = unknown>(
  path: string,
  { method = "GET", body }: { method?: ApiMethod; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = crypto.randomUUID();
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(0, {
      detail: "We couldn't reach the server. Check your connection and try again.",
    });
  }
  const requestId = response.headers.get("x-request-id") ?? undefined;
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new ApiError(response.status, data, requestId);
  return data as T;
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/**
 * Typed application errors mapped to RFC 9457 problem details.
 * Only the catalog's title and an explicit, safe `detail` ever reach clients.
 */

export const ERROR_CATALOG = {
  BAD_REQUEST: { status: 400, title: "The request could not be understood" },
  UNAUTHENTICATED: { status: 401, title: "Authentication required" },
  REAUTH_REQUIRED: { status: 401, title: "Please confirm it's you to continue" },
  MFA_REQUIRED: { status: 403, title: "Multi-factor authentication required" },
  FORBIDDEN: { status: 403, title: "You don't have permission to do this" },
  ACCOUNT_RESTRICTED: { status: 403, title: "Your account is restricted from this action" },
  EMAIL_NOT_VERIFIED: { status: 403, title: "Please verify your email address first" },
  NOT_FOUND: { status: 404, title: "Not found" },
  CONFLICT: { status: 409, title: "The resource was changed by someone else" },
  SLOT_UNAVAILABLE: { status: 409, title: "This time slot is no longer available" },
  HOLD_EXPIRED: { status: 409, title: "Your reservation has expired" },
  INVALID_STATE_TRANSITION: { status: 409, title: "This action isn't possible right now" },
  REQUEST_IN_PROGRESS: { status: 409, title: "A request with this idempotency key is in progress" },
  PRECONDITION_FAILED: { status: 412, title: "The resource has changed since you loaded it" },
  PAYLOAD_TOO_LARGE: { status: 413, title: "The request is too large" },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, title: "Unsupported content type" },
  VALIDATION_FAILED: { status: 422, title: "Some fields need attention" },
  BOOKING_NOT_ELIGIBLE: { status: 422, title: "This booking isn't possible" },
  IDEMPOTENCY_KEY_REUSED: {
    status: 422,
    title: "This idempotency key was already used with a different request",
  },
  PAYMENT_FAILED: { status: 402, title: "The payment failed" },
  PAYMENT_VERIFICATION_FAILED: { status: 400, title: "The payment could not be verified" },
  RATE_LIMITED: { status: 429, title: "Too many requests" },
  PROVIDER_UNAVAILABLE: { status: 503, title: "A partner service is temporarily unavailable" },
  MAINTENANCE: { status: 503, title: "This feature is temporarily unavailable" },
  INTERNAL: { status: 500, title: "Something went wrong on our side" },
} as const satisfies Record<string, { status: number; title: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export type FieldError = { path: string; code: string; message: string };

export type AppErrorOptions = {
  /** Safe, user-facing explanation. Never include internals, SQL or provider bodies. */
  detail?: string;
  errors?: FieldError[];
  /** Extra safe, machine-readable members (e.g. `reason`, `retryAfterSeconds`). */
  extensions?: Record<string, unknown>;
  headers?: Record<string, string>;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: string | undefined;
  readonly errors: FieldError[] | undefined;
  readonly extensions: Record<string, unknown> | undefined;
  readonly headers: Record<string, string> | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.detail ?? ERROR_CATALOG[code].title, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CATALOG[code].status;
    this.detail = options.detail;
    this.errors = options.errors;
    this.extensions = options.extensions;
    this.headers = options.headers;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: FieldError[];
  [extension: string]: unknown;
};

const PROBLEM_TYPE_BASE = "https://docs.aheadly.invalid/problems/";

/** Converts any thrown value to a safe problem document. Unknown errors become INTERNAL. */
export function toProblem(
  error: unknown,
  context: { instance?: string; requestId?: string } = {},
): ProblemDetails {
  const appError = isAppError(error) ? error : new AppError("INTERNAL");
  const { status, title } = ERROR_CATALOG[appError.code];
  const reserved = new Set([
    "type",
    "title",
    "status",
    "code",
    "detail",
    "instance",
    "requestId",
    "errors",
  ]);
  const extensions = Object.fromEntries(
    Object.entries(appError.extensions ?? {}).filter(([key]) => !reserved.has(key)),
  );
  return {
    ...extensions,
    type: PROBLEM_TYPE_BASE + appError.code.toLowerCase().replaceAll("_", "-"),
    title,
    status,
    code: appError.code,
    ...(appError.detail ? { detail: appError.detail } : {}),
    ...(context.instance ? { instance: context.instance } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(appError.errors?.length ? { errors: appError.errors } : {}),
  };
}

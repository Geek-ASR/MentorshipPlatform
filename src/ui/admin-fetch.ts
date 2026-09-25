/**
 * Shared fetch helper for admin mutation forms — attaches an idempotency key, and surfaces
 * `REAUTH_REQUIRED` (docs/07 §5 step-up: refunds, bans/suspensions, commission/settings changes,
 * role grants) as a typed error the caller can catch to redirect to a full re-sign-in, rather than
 * a generic failure message. A lighter inline password-only re-prompt exists only for MFA
 * enrollment (`admin/mfa/mfa-form.tsx`) — every other step-up action redirects to `/admin/login`
 * with a `returnTo`, a deliberate scope simplification (docs/19 Phase 11 retrospective).
 */
export class AdminFetchError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export async function adminFetch(
  path: string,
  init: { method?: "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<Response> {
  const response = await fetch(path, {
    method: init.method ?? "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: init.method === "DELETE" ? undefined : JSON.stringify(init.body ?? {}),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      title?: string;
      detail?: string;
      code?: string;
    } | null;
    throw new AdminFetchError(
      data?.detail ?? data?.title ?? `Request failed (${response.status}).`,
      data?.code,
    );
  }
  return response;
}

export function isReauthRequired(error: unknown): boolean {
  return error instanceof AdminFetchError && error.code === "REAUTH_REQUIRED";
}

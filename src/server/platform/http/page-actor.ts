import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEnv } from "@/config/env";
import { getDb } from "../db/client";
import { authorize, requireStaff } from "../authz/authorize";
import { isAppError } from "../errors";
import { systemClock } from "../clock";
import { resolveActor } from "./actor-resolver";
import { sessionCookieName } from "@/server/modules/auth";
import type { Role, UserActor } from "../authz/actor";

/**
 * Resolves the signed-in actor in a Server Component from the session cookie — the page-rendering
 * counterpart to `resolveActor`, which only ever runs inside `defineRoute` (docs/19 Phase 11: no
 * reusable page-friendly auth helper existed before this phase, since every prior page was public).
 * Reuses `resolveActor` itself rather than re-deriving cookie parsing, by rebuilding a minimal
 * `Request` carrying just the cookie header `next/headers` exposes.
 */
export async function getPageActor() {
  const env = getEnv();
  const jar = await cookies();
  const name = sessionCookieName(env);
  const token = jar.get(name)?.value;
  const headers = new Headers();
  if (token) headers.set("cookie", `${name}=${encodeURIComponent(token)}`);
  const request = new Request(env.APP_BASE_URL, { headers });
  const db = await getDb();
  return resolveActor(request, db, env);
}

/**
 * Gates an `/admin/*` Server Component page behind `requireStaff(roles)` (docs/07 §3.6: MFA is
 * mandatory for every staff request, enforced here exactly as `defineRoute` enforces it for API
 * routes). Not signed in at all → redirect to `/admin/login`. Signed in but not staff → a real 404
 * (never a 403 or a login prompt), matching the same "don't confirm the admin surface exists to a
 * non-staff user" intent `requireStaffWithMfa`'s own `NOT_FOUND` denial already carries server-side.
 * Staff but this session hasn't verified MFA yet → redirect to the step-up page with a return path.
 */
export async function requireStaffPage(
  roles: ReadonlyArray<Role>,
  returnTo: string,
): Promise<UserActor> {
  const actor = await getPageActor();
  if (actor.kind !== "user") redirect(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);

  try {
    authorize(actor, requireStaff(roles), undefined, { now: systemClock.now() });
  } catch (error) {
    if (isAppError(error) && error.code === "MFA_REQUIRED") {
      redirect(`/admin/mfa?returnTo=${encodeURIComponent(returnTo)}`);
    }
    notFound();
  }
  return actor;
}

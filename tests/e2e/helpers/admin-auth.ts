import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import type { BrowserContext } from "@playwright/test";
import { sessionCookieName } from "@/server/modules/auth";
import { getEnv, type Env } from "@/config/env";

function loadedEnv(): Env {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  return getEnv();
}

const AUTH_HEADERS = (baseURL: string) => ({
  origin: baseURL,
  "sec-fetch-site": "same-origin",
});

async function sessionCookieValue(
  context: BrowserContext,
  baseURL: string,
  env: Env,
): Promise<string> {
  const cookies = await context.cookies(baseURL);
  const sessionCookie = cookies.find((c) => c.name === sessionCookieName(env));
  if (!sessionCookie) throw new Error("sign-in did not set a session cookie");
  return sessionCookie.value;
}

export type AdminFixture = { email: string; password: string };

/**
 * Real E2E fixtures still go through the real sign-up/sign-in API (the behavior worth exercising),
 * but role-grant, email verification and MFA state use the same direct-SQL shortcut every
 * integration test in this repo already relies on — scripting the live TOTP enrollment UI is a
 * separate, much larger concern than the commission step-up journey this fixture supports (E11).
 */
export async function createStaleAdminSession(
  context: BrowserContext,
  baseURL: string,
  tag: string,
): Promise<AdminFixture> {
  const env = loadedEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const email = `e2e.admin.${tag}.${Date.now()}@example.com`;
    const password = "correct horse battery staple zephyr quartz";
    const signUpRes = await context.request.post(`${baseURL}/api/v1/auth/sign-up`, {
      data: {
        email,
        password,
        displayName: "E2E Admin",
        birthYear: 1990,
        termsVersion: "v1",
        privacyVersion: "v1",
      },
      headers: AUTH_HEADERS(baseURL),
    });
    if (!signUpRes.ok()) {
      throw new Error(`fixture sign-up failed: ${signUpRes.status()} ${await signUpRes.text()}`);
    }
    await sql`update app.users set email_verified = true where email = ${email}`;
    const signInRes = await context.request.post(`${baseURL}/api/v1/auth/sign-in`, {
      data: { email, password },
      headers: AUTH_HEADERS(baseURL),
    });
    if (!signInRes.ok()) {
      throw new Error(`fixture sign-in failed: ${signInRes.status()} ${await signInRes.text()}`);
    }
    const tokenHash = createHash("sha256")
      .update(await sessionCookieValue(context, baseURL, env))
      .digest("hex");
    const [session] = await sql<{ user_id: string }[]>`
      select user_id from app.auth_sessions where token_hash = ${tokenHash}
    `;
    if (!session) throw new Error("no session row found for the fixture sign-in");
    // Backdated past `requireRecentUserAuth`'s window so the very first sensitive action in the
    // test genuinely requires step-up, exactly like a real admin returning to an old tab (docs/07
    // §5), rather than relying on real elapsed time.
    await sql`
      update app.auth_sessions
      set mfa_verified = true, auth_time = now() - interval '1 hour'
      where token_hash = ${tokenHash}
    `;
    await sql`
      insert into app.user_roles (user_id, role) values (${session.user_id}, 'admin')
      on conflict do nothing
    `;
    return { email, password };
  } finally {
    await sql.end();
  }
}

/** Re-signs in (a fresh session) and marks MFA verified — used after the step-up redirect. */
export async function refreshMfaForCurrentSession(
  context: BrowserContext,
  baseURL: string,
  email: string,
  password: string,
): Promise<void> {
  const env = loadedEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await context.request.post(`${baseURL}/api/v1/auth/sign-in`, {
      data: { email, password },
      headers: AUTH_HEADERS(baseURL),
    });
    const tokenHash = createHash("sha256")
      .update(await sessionCookieValue(context, baseURL, env))
      .digest("hex");
    await sql`update app.auth_sessions set mfa_verified = true where token_hash = ${tokenHash}`;
  } finally {
    await sql.end();
  }
}

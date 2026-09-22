import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { GET as me } from "@/app/api/v1/auth/me/route";

vi.mock("@/server/modules/auth/infra/hibp-checker", () => ({
  createHibpChecker: () => async () => false,
}));

const googleIdentity = vi.hoisted(() => ({
  current: {
    sub: "google-sub-1",
    email: "shared@example.com",
    emailVerified: true,
    name: "Google User",
  },
}));

vi.mock("@/server/modules/auth/infra/google-oauth-client", () => ({
  exchangeGoogleCode: async () => ({ idToken: "fake-id-token" }),
  verifyGoogleIdToken: async () => googleIdentity.current,
}));

const { GET: googleStart } = await import("@/app/api/v1/auth/google/start/route");
const { GET: googleCallback } = await import("@/app/api/v1/auth/google/callback/route");

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  useDatabaseForRoutes(t.db);
});
afterAll(async () => t?.dispose());
beforeEach(async () => {
  await t.db.execute(
    sql`truncate table app.users, app.outbox_jobs, app.rate_limit_buckets cascade`,
  );
  googleIdentity.current = {
    sub: "google-sub-1",
    email: "shared@example.com",
    emailVerified: true,
    name: "Google User",
  };
});

function oauthStateCookie(response: Response): string {
  const [raw] = response.headers.getSetCookie();
  if (!raw) throw new Error("expected a set-cookie header");
  return raw.split(";")[0]!;
}

/** Picks the `aheadly_session` cookie out of a response that may set several cookies at once. */
function sessionCookieFrom(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("aheadly_session="));
  if (!cookie) throw new Error("expected a session cookie");
  return cookie.split(";")[0]!;
}

async function startGoogle(): Promise<{ cookie: string; state: string }> {
  const response = await googleStart(
    new Request(
      "http://localhost:3000/api/v1/auth/google/start?birthYear=2000&termsVersion=v1&privacyVersion=v1",
    ),
    routeContext(),
  );
  expect(response.status).toBe(302);
  const location = response.headers.get("location")!;
  const state = new URL(location).searchParams.get("state")!;
  return { cookie: oauthStateCookie(response), state };
}

describe("Google sign-in", () => {
  it("creates a new verified account on first sign-in", async () => {
    const { cookie, state } = await startGoogle();
    const callback = await googleCallback(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=abc&state=${state}`, {
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(callback.status).toBe(302);
    const sessionCookie = sessionCookieFrom(callback);

    const [user] = await t.db.execute<{ email_verified: boolean; email: string }>(
      sql`select email, email_verified from app.users where email = 'shared@example.com'`,
    );
    expect(user?.email_verified).toBe(true);

    const meResponse = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie: sessionCookie } }),
      routeContext(),
    );
    expect(meResponse.status).toBe(200);
  });

  it("rejects a state that doesn't match the cookie (CSRF defence)", async () => {
    const { cookie } = await startGoogle();
    const callback = await googleCallback(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=abc&state=wrong-state`, {
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(callback.status).toBe(403);
  });

  it("automatically links to a verified local account with an exact email match", async () => {
    await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        body: {
          email: "shared@example.com",
          password: "correct battery staple phrase three",
          displayName: "Local Owner",
          birthYear: 2000,
          termsVersion: "v1",
          privacyVersion: "v1",
        },
      }),
      routeContext(),
    );
    await t.db.execute(
      sql`update app.users set email_verified = true where email = 'shared@example.com'`,
    );
    const [before] = await t.db.execute<{ id: string }>(
      sql`select id from app.users where email = 'shared@example.com'`,
    );

    const { cookie, state } = await startGoogle();
    const callback = await googleCallback(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=abc&state=${state}`, {
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(callback.status).toBe(302);

    const userCount = await t.db.execute<{ count: string }>(
      sql`select count(*)::text as count from app.users`,
    );
    expect(userCount[0]?.count).toBe("1");
    const [linked] = await t.db.execute<{ user_id: string }>(
      sql`select user_id from app.auth_accounts where provider = 'google' and provider_account_id = 'google-sub-1'`,
    );
    expect(linked?.user_id).toBe(before?.id);
  });

  it("a verified Google identity takes ownership of an unverified local credential account (pre-hijack defence)", async () => {
    await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        body: {
          email: "shared@example.com",
          password: "correct battery staple phrase four",
          displayName: "Never Verified",
          birthYear: 2000,
          termsVersion: "v1",
          privacyVersion: "v1",
        },
      }),
      routeContext(),
    );
    // Deliberately left unverified.
    const [before] = await t.db.execute<{ id: string }>(
      sql`select id from app.users where email = 'shared@example.com'`,
    );

    const { cookie, state } = await startGoogle();
    const callback = await googleCallback(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=abc&state=${state}`, {
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(callback.status).toBe(302);

    const [after] = await t.db.execute<{ id: string; email_verified: boolean }>(
      sql`select id, email_verified from app.users where email = 'shared@example.com'`,
    );
    expect(after?.id).toBe(before?.id);
    expect(after?.email_verified).toBe(true);

    // The old password credential no longer exists — only the Google login method remains.
    const accounts = await t.db.execute<{ provider: string }>(
      sql`select provider from app.auth_accounts where user_id = ${before!.id}`,
    );
    expect(accounts.map((a) => a.provider)).toEqual(["google"]);
  });

  it("rejects a Google identity whose email is not verified", async () => {
    googleIdentity.current = { ...googleIdentity.current, emailVerified: false };
    const { cookie, state } = await startGoogle();
    const callback = await googleCallback(
      new Request(`http://localhost:3000/api/v1/auth/google/callback?code=abc&state=${state}`, {
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(callback.status).toBe(403);
  });
});

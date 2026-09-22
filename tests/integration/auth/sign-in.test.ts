import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";

// The real checker calls the live HIBP API; tests must not depend on network access.
vi.mock("@/server/modules/auth/infra/hibp-checker", () => ({
  createHibpChecker: () => async () => false,
}));
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { POST as signOut } from "@/app/api/v1/auth/sign-out/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { GET as listSessions } from "@/app/api/v1/auth/sessions/route";
import { POST as revokeAllSessions } from "@/app/api/v1/auth/sessions/revoke-all/route";

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
});

const email = "sign-in-test@example.com";
const password = "correct horse battery staple";

async function createVerifiedUser(): Promise<void> {
  await signUp(
    jsonRequest("/api/v1/auth/sign-up", {
      body: {
        email,
        password,
        displayName: "Sign In Test",
        birthYear: new Date().getFullYear() - 20,
        termsVersion: "v1",
        privacyVersion: "v1",
      },
    }),
    routeContext(),
  );
  await t.db.execute(sql`update app.users set email_verified = true where email = ${email}`);
}

function sessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("expected a set-cookie header");
  return raw.split(";")[0]!;
}

describe("POST /api/v1/auth/sign-in", () => {
  it("signs in with correct credentials and sets a session cookie", async () => {
    await createVerifiedUser();
    const response = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "signed_in" });
    const cookie = sessionCookie(response);
    expect(cookie).toContain("aheadly_session=");

    const meResponse = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
      routeContext(),
    );
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as { email: string; roles: string[] };
    expect(meBody.email).toBe(email);
    expect(meBody.roles).toEqual(["student"]);
  });

  it("rejects a wrong password with a generic error", async () => {
    await createVerifiedUser();
    const response = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password: "wrong password entirely" } }),
      routeContext(),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("gives the same generic error for an email that doesn't exist (no enumeration)", async () => {
    const response = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email: "nobody@example.com", password } }),
      routeContext(),
    );
    expect(response.status).toBe(401);
    const { requestId: _unknownRequestId, ...unknownProblem } = (await response.json()) as Record<
      string,
      unknown
    >;
    const known = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password: "wrong password entirely" } }),
      routeContext(),
    );
    const { requestId: _knownRequestId, ...knownProblem } = (await known.json()) as Record<
      string,
      unknown
    >;
    expect(knownProblem).toEqual(unknownProblem);
  });

  it("throttles an account after repeated failures", async () => {
    await createVerifiedUser();
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await signIn(
        jsonRequest("/api/v1/auth/sign-in", {
          body: { email, password: "wrong password entirely" },
        }),
        routeContext(),
      );
    }
    expect(last!.status).toBe(429);
  });

  it("/me rejects an unauthenticated request", async () => {
    const response = await me(new Request("http://localhost:3000/api/v1/auth/me"), routeContext());
    expect(response.status).toBe(401);
  });
});

describe("session lifecycle", () => {
  it("sign-out revokes the session so it can no longer be used", async () => {
    await createVerifiedUser();
    const signInResponse = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );
    const cookie = sessionCookie(signInResponse);

    const before = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
      routeContext(),
    );
    expect(before.status).toBe(200);

    const out = await signOut(
      jsonRequest("/api/v1/auth/sign-out", { headers: { cookie } }),
      routeContext(),
    );
    expect(out.status).toBe(204);

    const after = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
      routeContext(),
    );
    expect(after.status).toBe(401);
  });

  it("lists active sessions and marks the caller's session as current", async () => {
    await createVerifiedUser();
    const first = sessionCookie(
      await signIn(
        jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
        routeContext(),
      ),
    );
    await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );

    const response = await listSessions(
      new Request("http://localhost:3000/api/v1/auth/sessions", { headers: { cookie: first } }),
      routeContext(),
    );
    expect(response.status).toBe(200);
    const sessions = (await response.json()) as { isCurrent: boolean }[];
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  it("revoke-all signs out every device including the current one", async () => {
    await createVerifiedUser();
    const cookie = sessionCookie(
      await signIn(
        jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
        routeContext(),
      ),
    );
    const revoke = await revokeAllSessions(
      jsonRequest("/api/v1/auth/sessions/revoke-all", { headers: { cookie } }),
      routeContext(),
    );
    expect(revoke.status).toBe(204);

    const after = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
      routeContext(),
    );
    expect(after.status).toBe(401);
  });
});

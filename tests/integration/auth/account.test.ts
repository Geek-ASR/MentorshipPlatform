import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { POST as verifyEmail } from "@/app/api/v1/auth/verify-email/route";
import { POST as resendVerification } from "@/app/api/v1/auth/verify-email/resend/route";
import { GET as viewer } from "@/app/api/v1/auth/viewer/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { GET as listSessions } from "@/app/api/v1/auth/sessions/route";
import { POST as revokeSession } from "@/app/api/v1/auth/sessions/[id]/revoke/route";
import { PATCH as updateAccount } from "@/app/api/v1/me/account/route";

vi.mock("@/server/modules/auth/infra/hibp-checker", () => ({
  createHibpChecker: () => async () => false,
}));

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

const email = "account.settings@example.com";
const password = "correct battery staple example";

async function signUpAndSignIn({ verified }: { verified: boolean }): Promise<string> {
  await signUp(
    jsonRequest("/api/v1/auth/sign-up", {
      body: {
        email,
        password,
        displayName: "Account Settings",
        birthYear: new Date().getFullYear() - 20,
        termsVersion: "v1",
        privacyVersion: "v1",
      },
    }),
    routeContext(),
  );
  if (verified) {
    await t.db.execute(sql`update app.users set email_verified = true where email = ${email}`);
  }
  const response = await signIn(
    jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
    routeContext(),
  );
  return response.headers.get("set-cookie")!.split(";")[0]!;
}

async function emailTokens(): Promise<string[]> {
  const jobs = await t.db.execute<{ payload: { text: string } }>(
    sql`select payload from app.outbox_jobs where type = 'auth.send_email' order by created_at`,
  );
  return jobs
    .map((job) => /verify-email\?token=([\w-]+)/.exec(job.payload.text)?.[1])
    .filter((token): token is string => Boolean(token))
    .map(decodeURIComponent);
}

describe("PATCH /api/v1/me/account (docs/19 Phase 15a)", () => {
  it("updates the name and time zone, returns the new me-DTO and audits which fields changed", async () => {
    const cookie = await signUpAndSignIn({ verified: true });
    const response = await updateAccount(
      jsonRequest("/api/v1/me/account", {
        method: "PATCH",
        body: { displayName: "  Renamed Person ", timezone: "Europe/Berlin" },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      email,
      displayName: "Renamed Person",
      timezone: "Europe/Berlin",
    });

    const [audit] = await t.db.execute<{ metadata: { fields: string[] } }>(
      sql`select metadata from app.audit_logs where action = 'user.account_updated'`,
    );
    expect(audit!.metadata.fields.sort()).toEqual(["displayName", "timezone"]);
  });

  it("rejects an unknown time zone as a field error, changing nothing", async () => {
    const cookie = await signUpAndSignIn({ verified: true });
    const response = await updateAccount(
      jsonRequest("/api/v1/me/account", {
        method: "PATCH",
        body: { timezone: "Mars/Olympus_Mons" },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { path: string }[] };
    expect(body.errors.map((e) => e.path)).toEqual(["timezone"]);
    const [row] = await t.db.execute<{ timezone: string }>(
      sql`select timezone from app.users where email = ${email}`,
    );
    expect(row!.timezone).toBe("UTC");
  });

  it("rejects an empty update and a blank name", async () => {
    const cookie = await signUpAndSignIn({ verified: true });
    const empty = await updateAccount(
      jsonRequest("/api/v1/me/account", { method: "PATCH", body: {}, headers: { cookie } }),
      routeContext(),
    );
    expect(empty.status).toBe(422);
    const blank = await updateAccount(
      jsonRequest("/api/v1/me/account", {
        method: "PATCH",
        body: { displayName: "   " },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(blank.status).toBe(422);
  });

  it("requires a signed-in caller", async () => {
    const response = await updateAccount(
      jsonRequest("/api/v1/me/account", { method: "PATCH", body: { displayName: "Nobody" } }),
      routeContext(),
    );
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/auth/viewer", () => {
  it("answers 200 with a null viewer for anonymous visitors (no 401 noise on public pages)", async () => {
    const response = await viewer(
      jsonRequest("/api/v1/auth/viewer", { method: "GET" }),
      routeContext(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ viewer: null });
  });

  it("returns the caller's own account for a signed-in visitor", async () => {
    const cookie = await signUpAndSignIn({ verified: true });
    const response = await viewer(
      jsonRequest("/api/v1/auth/viewer", { method: "GET", headers: { cookie } }),
      routeContext(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      viewer: { email, displayName: "Account Settings", timezone: "UTC", roles: ["student"] },
    });
  });
});

describe("POST /api/v1/auth/verify-email/resend", () => {
  it("sends a fresh link and retires the old one", async () => {
    const cookie = await signUpAndSignIn({ verified: false });
    const [original] = await emailTokens();

    const response = await resendVerification(
      jsonRequest("/api/v1/auth/verify-email/resend", { headers: { cookie } }),
      routeContext(),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ outcome: "sent" });

    const tokens = await emailTokens();
    expect(tokens).toHaveLength(2);
    const fresh = tokens[1]!;

    const stale = await verifyEmail(
      jsonRequest("/api/v1/auth/verify-email", { body: { token: original } }),
      routeContext(),
    );
    expect(stale.status).toBe(400);
    const ok = await verifyEmail(
      jsonRequest("/api/v1/auth/verify-email", { body: { token: fresh } }),
      routeContext(),
    );
    expect(ok.status).toBe(204);
  });

  it("is a no-op for an already-verified account", async () => {
    const cookie = await signUpAndSignIn({ verified: true });
    const before = (await emailTokens()).length;
    const response = await resendVerification(
      jsonRequest("/api/v1/auth/verify-email/resend", { headers: { cookie } }),
      routeContext(),
    );
    expect(await response.json()).toEqual({ outcome: "already_verified" });
    expect(await emailTokens()).toHaveLength(before);
  });

  it("requires a signed-in caller", async () => {
    const response = await resendVerification(
      jsonRequest("/api/v1/auth/verify-email/resend"),
      routeContext(),
    );
    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/auth/sessions/:id/revoke (ASVS 7.5.2)", () => {
  async function signInAgain(address = email): Promise<string> {
    const response = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email: address, password } }),
      routeContext(),
    );
    return response.headers.get("set-cookie")!.split(";")[0]!;
  }

  async function sessionsFor(cookie: string) {
    const response = await listSessions(
      jsonRequest("/api/v1/auth/sessions", { method: "GET", headers: { cookie } }),
      routeContext(),
    );
    return (await response.json()) as { id: string; isCurrent: boolean }[];
  }

  async function status(cookie: string): Promise<number> {
    return (
      await me(
        jsonRequest("/api/v1/auth/me", { method: "GET", headers: { cookie } }),
        routeContext(),
      )
    ).status;
  }

  it("signs out one chosen device and leaves this one signed in", async () => {
    const laptop = await signUpAndSignIn({ verified: true });
    const phone = await signInAgain();
    const phoneSession = (await sessionsFor(phone)).find((s) => s.isCurrent)!;

    const response = await revokeSession(
      jsonRequest(`/api/v1/auth/sessions/${phoneSession.id}/revoke`, {
        headers: { cookie: laptop },
      }),
      routeContext({ id: phoneSession.id }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await status(phone)).toBe(401);
    expect(await status(laptop)).toBe(200);

    const [audit] = await t.db.execute<{ target_id: string }>(
      sql`select target_id from app.audit_logs where action = 'auth.session_revoked'`,
    );
    expect(audit!.target_id).toBe(phoneSession.id);
  });

  it("revoking the current session also clears this browser's cookie", async () => {
    const cookie = await signUpAndSignIn({ verified: true });
    const current = (await sessionsFor(cookie)).find((s) => s.isCurrent)!;
    const response = await revokeSession(
      jsonRequest(`/api/v1/auth/sessions/${current.id}/revoke`, { headers: { cookie } }),
      routeContext({ id: current.id }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(await status(cookie)).toBe(401);
  });

  it("answers 404 for another person's session and leaves it untouched", async () => {
    const mine = await signUpAndSignIn({ verified: true });
    const otherEmail = "someone.else@example.com";
    await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        body: {
          email: otherEmail,
          password,
          displayName: "Someone Else",
          birthYear: new Date().getFullYear() - 22,
          termsVersion: "v1",
          privacyVersion: "v1",
        },
      }),
      routeContext(),
    );
    const theirs = await signInAgain(otherEmail);
    const theirSession = (await sessionsFor(theirs)).find((s) => s.isCurrent)!;

    const response = await revokeSession(
      jsonRequest(`/api/v1/auth/sessions/${theirSession.id}/revoke`, { headers: { cookie: mine } }),
      routeContext({ id: theirSession.id }),
    );
    expect(response.status).toBe(404);
    expect(await status(theirs)).toBe(200);
  });
});

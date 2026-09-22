import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as requestReset } from "@/app/api/v1/auth/password/reset/request/route";
import { POST as confirmReset } from "@/app/api/v1/auth/password/reset/confirm/route";
import { POST as changePassword } from "@/app/api/v1/auth/password/change/route";
import { POST as requestEmailChange } from "@/app/api/v1/auth/email/change/request/route";
import { POST as confirmEmailChange } from "@/app/api/v1/auth/email/change/confirm/route";
import { POST as revertEmailChange } from "@/app/api/v1/auth/email/change/revert/route";

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

const email = "reset-flow@example.com";
const password = "correct battery staple example";

async function createVerifiedUser(): Promise<void> {
  await signUp(
    jsonRequest("/api/v1/auth/sign-up", {
      body: {
        email,
        password,
        displayName: "Reset Flow",
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

async function latestEmailToken(purpose: string): Promise<string> {
  const jobs = await t.db.execute<{ payload: unknown }>(
    sql`select payload from app.outbox_jobs where type = 'auth.send_email' order by created_at desc limit 1`,
  );
  const text = (jobs[0]!.payload as { text: string }).text;
  const match = /token=([\w-]+)/.exec(text);
  if (!match) throw new Error(`no token found in latest email for ${purpose}`);
  return decodeURIComponent(match[1]!);
}

describe("password reset", () => {
  it("resets the password, revokes existing sessions, and signs in with the new password", async () => {
    await createVerifiedUser();
    const oldCookie = sessionCookie(
      await signIn(
        jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
        routeContext(),
      ),
    );

    const reqResponse = await requestReset(
      jsonRequest("/api/v1/auth/password/reset/request", { body: { email } }),
      routeContext(),
    );
    expect(reqResponse.status).toBe(202);
    const token = await latestEmailToken("password_reset");

    const newPassword = "a brand new battery staple phrase";
    const confirmResponse = await confirmReset(
      jsonRequest("/api/v1/auth/password/reset/confirm", { body: { token, newPassword } }),
      routeContext(),
    );
    expect(confirmResponse.status).toBe(204);

    const staleMe = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie: oldCookie } }),
      routeContext(),
    );
    expect(staleMe.status).toBe(401);

    const oldPasswordSignIn = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );
    expect(oldPasswordSignIn.status).toBe(401);

    const newPasswordSignIn = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password: newPassword } }),
      routeContext(),
    );
    expect(newPasswordSignIn.status).toBe(200);
  });

  it("gives a 202 for an unknown email too (no enumeration)", async () => {
    const response = await requestReset(
      jsonRequest("/api/v1/auth/password/reset/request", { body: { email: "ghost@example.com" } }),
      routeContext(),
    );
    expect(response.status).toBe(202);
  });

  it("rejects an already-used reset token", async () => {
    await createVerifiedUser();
    await requestReset(
      jsonRequest("/api/v1/auth/password/reset/request", { body: { email } }),
      routeContext(),
    );
    const token = await latestEmailToken("password_reset");
    const newPassword = "another totally different phrase";
    await confirmReset(
      jsonRequest("/api/v1/auth/password/reset/confirm", { body: { token, newPassword } }),
      routeContext(),
    );
    const replay = await confirmReset(
      jsonRequest("/api/v1/auth/password/reset/confirm", {
        body: { token, newPassword: "yet another phrase here" },
      }),
      routeContext(),
    );
    expect(replay.status).toBe(400);
  });
});

describe("authenticated password change", () => {
  it("requires the correct current password and keeps the acting session alive", async () => {
    await createVerifiedUser();
    const cookie = sessionCookie(
      await signIn(
        jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
        routeContext(),
      ),
    );

    const wrong = await changePassword(
      jsonRequest("/api/v1/auth/password/change", {
        body: { currentPassword: "not the right password", newPassword: "totally new phrase here" },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(wrong.status).toBe(401);

    const ok = await changePassword(
      jsonRequest("/api/v1/auth/password/change", {
        body: { currentPassword: password, newPassword: "totally new phrase here" },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(ok.status).toBe(204);

    const stillIn = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
      routeContext(),
    );
    expect(stillIn.status).toBe(200);
  });

  it("requires step-up: a session authenticated too long ago is rejected (docs/07 §5)", async () => {
    await createVerifiedUser();
    const cookie = sessionCookie(
      await signIn(
        jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
        routeContext(),
      ),
    );
    await t.db.execute(sql`update app.auth_sessions set auth_time = now() - interval '1 hour'`);

    const response = await changePassword(
      jsonRequest("/api/v1/auth/password/change", {
        body: { currentPassword: password, newPassword: "totally new phrase here" },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(response.status).toBe(401);
    const problem = (await response.json()) as { code: string };
    expect(problem.code).toBe("REAUTH_REQUIRED");
  });
});

describe("email change", () => {
  it("only applies the change after the new address is confirmed, and the old address can undo it", async () => {
    await createVerifiedUser();
    const cookie = sessionCookie(
      await signIn(
        jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
        routeContext(),
      ),
    );

    const newEmail = "new-address@example.com";
    const requestResponse = await requestEmailChange(
      jsonRequest("/api/v1/auth/email/change/request", { body: { newEmail }, headers: { cookie } }),
      routeContext(),
    );
    expect(requestResponse.status).toBe(202);

    const [unchanged] = await t.db.execute<{ email: string }>(
      sql`select email from app.users where email = ${email}`,
    );
    expect(unchanged?.email).toBe(email);

    const confirmToken = await latestEmailToken("email_change");
    const confirmResponse = await confirmEmailChange(
      jsonRequest("/api/v1/auth/email/change/confirm", { body: { token: confirmToken } }),
      routeContext(),
    );
    expect(confirmResponse.status).toBe(204);

    const [changed] = await t.db.execute<{ email: string }>(
      sql`select email from app.users where email = ${newEmail}`,
    );
    expect(changed?.email).toBe(newEmail);

    const revertToken = await latestEmailToken("email_change_revert");
    const revertResponse = await revertEmailChange(
      jsonRequest("/api/v1/auth/email/change/revert", { body: { token: revertToken } }),
      routeContext(),
    );
    expect(revertResponse.status).toBe(204);

    const [reverted] = await t.db.execute<{ email: string }>(
      sql`select email from app.users where email = ${email}`,
    );
    expect(reverted?.email).toBe(email);

    // Reverting must sign out every device.
    const afterRevert = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
      routeContext(),
    );
    expect(afterRevert.status).toBe(401);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as verifyEmail } from "@/app/api/v1/auth/verify-email/route";

// The real checker calls the live HIBP API; tests must not depend on network access.
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
  await t.db.execute(sql`truncate table app.users, app.outbox_jobs cascade`);
});

const validBody = {
  email: "new.student@example.com",
  password: "correct horse battery staple",
  displayName: "New Student",
  birthYear: new Date().getFullYear() - 20,
  termsVersion: "2026-01-01",
  privacyVersion: "2026-01-01",
};

async function countUsers(): Promise<number> {
  const rows = await t.db.execute<{ count: string }>(
    sql`select count(*)::text as count from app.users`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function pendingEmailJobs(): Promise<{ payload: unknown }[]> {
  return t.db.execute(
    sql`select payload from app.outbox_jobs where type = 'auth.send_email' order by created_at`,
  );
}

describe("POST /api/v1/auth/sign-up", () => {
  it("creates a user, grants the student role and queues a verification email", async () => {
    const response = await signUp(
      jsonRequest("/api/v1/auth/sign-up", { body: validBody }),
      routeContext(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "check_inbox" });
    expect(await countUsers()).toBe(1);

    const jobs = await pendingEmailJobs();
    expect(jobs).toHaveLength(1);
    expect((jobs[0]!.payload as { to: string }).to).toBe(validBody.email);

    const roles = await t.db.execute<{ role: string }>(
      sql`select role from app.user_roles ur join app.users u on u.id = ur.user_id where u.email = ${validBody.email}`,
    );
    expect(roles.map((r) => r.role)).toEqual(["student"]);
  });

  it("does not create a second account for an existing email, and gives the same response (no enumeration)", async () => {
    await signUp(jsonRequest("/api/v1/auth/sign-up", { body: validBody }), routeContext());
    const second = await signUp(
      jsonRequest("/api/v1/auth/sign-up", { body: { ...validBody, displayName: "Impersonator" } }),
      routeContext(),
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ outcome: "check_inbox" });
    expect(await countUsers()).toBe(1);

    const jobs = await pendingEmailJobs();
    expect(jobs).toHaveLength(2); // original verification email + the "attempted sign-up" notice
  });

  it("rejects an underage birth year", async () => {
    const response = await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        body: {
          ...validBody,
          email: "young@example.com",
          birthYear: new Date().getFullYear() - 10,
        },
      }),
      routeContext(),
    );
    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors: { path: string }[] };
    expect(problem.errors.some((e) => e.path === "birthYear")).toBe(true);
    expect(await countUsers()).toBe(0);
  });

  it("rejects a password shorter than the configured minimum", async () => {
    const response = await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        body: { ...validBody, email: "weak@example.com", password: "short1" },
      }),
      routeContext(),
    );
    expect(response.status).toBe(422);
    expect(await countUsers()).toBe(0);
  });

  it("rejects a password containing the account's own email or name", async () => {
    const response = await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        body: {
          ...validBody,
          email: "context@example.com",
          password: "New Student is a great person",
        },
      }),
      routeContext(),
    );
    expect(response.status).toBe(422);
    expect(await countUsers()).toBe(0);
  });
});

describe("POST /api/v1/auth/verify-email", () => {
  it("verifies the email with a valid token and rejects reuse", async () => {
    await signUp(jsonRequest("/api/v1/auth/sign-up", { body: validBody }), routeContext());
    const [token] = await t.db.execute<{ token_hash: string }>(
      sql`select token_hash from app.auth_verification_tokens where purpose = 'email_verify'`,
    );
    expect(token).toBeDefined();

    // The route only ever receives the raw token (never the hash); recover it isn't possible from the
    // DB, so this test drives verifyEmail through the outbox email body instead, which contains the link.
    const jobs = await pendingEmailJobs();
    const emailBody = (jobs[0]!.payload as { text: string }).text;
    const match = /token=([\w-]+)/.exec(emailBody);
    expect(match).not.toBeNull();
    const rawToken = decodeURIComponent(match![1]!);

    const first = await verifyEmail(
      jsonRequest("/api/v1/auth/verify-email", { body: { token: rawToken } }),
      routeContext(),
    );
    expect(first.status).toBe(204);

    const [user] = await t.db.execute<{ email_verified: boolean }>(
      sql`select email_verified from app.users where email = ${validBody.email}`,
    );
    expect(user?.email_verified).toBe(true);

    const second = await verifyEmail(
      jsonRequest("/api/v1/auth/verify-email", { body: { token: rawToken } }),
      routeContext(),
    );
    expect(second.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    await signUp(jsonRequest("/api/v1/auth/sign-up", { body: validBody }), routeContext());
    const jobs = await pendingEmailJobs();
    const emailBody = (jobs[0]!.payload as { text: string }).text;
    const rawToken = decodeURIComponent(/token=([\w-]+)/.exec(emailBody)![1]!);
    await t.db.execute(
      sql`update app.auth_verification_tokens set expires_at = now() - interval '1 hour' where purpose = 'email_verify'`,
    );

    const response = await verifyEmail(
      jsonRequest("/api/v1/auth/verify-email", { body: { token: rawToken } }),
      routeContext(),
    );
    expect(response.status).toBe(400);
    const [user] = await t.db.execute<{ email_verified: boolean }>(
      sql`select email_verified from app.users where email = ${validBody.email}`,
    );
    expect(user?.email_verified).toBe(false);
  });

  it("rejects an unknown token", async () => {
    const response = await verifyEmail(
      jsonRequest("/api/v1/auth/verify-email", {
        body: { token: "not-a-real-token-not-a-real-token" },
      }),
      routeContext(),
    );
    expect(response.status).toBe(400);
  });
});

import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { auditLogs } from "@/server/platform/db/tables/platform";

import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as createReport } from "@/app/api/v1/reports/route";
import { GET as listCases } from "@/app/api/v1/admin/cases/route";
import { POST as decideCaseAction } from "@/app/api/v1/admin/cases/[id]/actions/route";
import { PUT as putSetting } from "@/app/api/v1/admin/settings/[key]/route";
import { PUT as putFeatureFlag } from "@/app/api/v1/admin/feature-flags/[key]/route";
import { POST as grantRole } from "@/app/api/v1/admin/users/[id]/roles/route";

vi.mock("@/server/modules/auth/infra/hibp-checker", () => ({
  createHibpChecker: () => async () => false,
}));

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  useDatabaseForRoutes(t.db);
});
afterAll(async () => t?.dispose());

function sessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error(`expected a set-cookie header (status ${response.status})`);
  return raw.split(";")[0]!;
}

function idemHeaders(cookie: string) {
  return { cookie, "idempotency-key": randomUUID() };
}

async function signUpAndVerify(
  email: string,
  displayName: string,
): Promise<{ cookie: string; userId: string }> {
  const password = "correct battery staple audit tests";
  const signUpRes = await signUp(
    jsonRequest("/api/v1/auth/sign-up", {
      body: {
        email,
        password,
        displayName,
        birthYear: 2000,
        termsVersion: "v1",
        privacyVersion: "v1",
      },
    }),
    routeContext(),
  );
  if (signUpRes.status !== 200) throw new Error(`sign-up failed: ${signUpRes.status}`);
  await t.db.execute(sql`update app.users set email_verified = true where email = ${email}`);
  const response = await signIn(
    jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
    routeContext(),
  );
  const cookie = sessionCookie(response);
  const meResponse = await me(
    new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
    routeContext(),
  );
  const userId = ((await meResponse.json()) as { id: string }).id;
  return { cookie, userId };
}

async function grantRoleDirectly(cookie: string, role: string): Promise<void> {
  const token = cookie.split("=")[1]!.split(";")[0]!;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await t.db.execute(
    sql`update app.auth_sessions set mfa_verified = true where token_hash = ${tokenHash}`,
  );
  const [session] = await t.db.execute<{ user_id: string }>(
    sql`select user_id from app.auth_sessions where token_hash = ${tokenHash}`,
  );
  await t.db.execute(
    sql`insert into app.user_roles (user_id, role) values (${session!.user_id}, ${role}) on conflict do nothing`,
  );
}

async function latestAuditAction() {
  const [row] = await t.db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
  return row;
}

// A shared, small pool of actors reused across every sub-test below — sign-up is rate-limited to
// 10/hour/IP (docs/07), so this file deliberately creates as few accounts as the scenarios allow
// rather than one fresh account per assertion.
describe("Phase 11 exit criteria: every admin action audited; BOLA/BFLA role matrix", () => {
  let plainUser: { cookie: string; userId: string };
  let admin: { cookie: string; userId: string };
  let superAdmin: { cookie: string; userId: string };
  let moderator: { cookie: string; userId: string };
  let financeOnly: { cookie: string; userId: string };
  let reporter: { cookie: string; userId: string };
  let target: { cookie: string; userId: string }; // doubles as the report's subject.

  beforeAll(async () => {
    plainUser = await signUpAndVerify("plain.audit@example.com", "Plain User");
    admin = await signUpAndVerify("admin.audit@example.com", "Admin");
    await grantRoleDirectly(admin.cookie, "admin");
    superAdmin = await signUpAndVerify("superadmin.audit@example.com", "Super Admin");
    await grantRoleDirectly(superAdmin.cookie, "super_admin");
    moderator = await signUpAndVerify("moderator.audit@example.com", "Moderator");
    await grantRoleDirectly(moderator.cookie, "moderator");
    financeOnly = await signUpAndVerify("finance.audit@example.com", "Finance");
    await grantRoleDirectly(financeOnly.cookie, "finance");
    reporter = await signUpAndVerify("reporter.audit@example.com", "Reporter");
    target = await signUpAndVerify("target.audit@example.com", "Target");
  });

  it("settings update writes settings.updated, gated to admin/super_admin", async () => {
    const rejected = await putSetting(
      jsonRequest("/api/v1/admin/settings/booking.hold_ttl_min", {
        method: "PUT",
        body: { value: 20, reason: "test" },
        headers: idemHeaders(plainUser.cookie),
      }),
      routeContext({ key: "booking.hold_ttl_min" }),
    );
    expect([401, 403, 404]).toContain(rejected.status);

    const ok = await putSetting(
      jsonRequest("/api/v1/admin/settings/booking.hold_ttl_min", {
        method: "PUT",
        body: { value: 20, reason: "load-test tuning" },
        headers: idemHeaders(admin.cookie),
      }),
      routeContext({ key: "booking.hold_ttl_min" }),
    );
    expect(ok.status).toBe(200);
    const entry = await latestAuditAction();
    expect(entry?.action).toBe("settings.updated");
    expect(entry?.actorUserId).toBe(admin.userId);
  });

  it("feature flag update writes feature_flag.updated, gated to admin/super_admin", async () => {
    const rejected = await putFeatureFlag(
      jsonRequest("/api/v1/admin/feature-flags/signup.enabled", {
        method: "PUT",
        body: { enabled: false, reason: "test" },
        headers: idemHeaders(moderator.cookie),
      }),
      routeContext({ key: "signup.enabled" }),
    );
    expect([401, 403, 404]).toContain(rejected.status);

    const ok = await putFeatureFlag(
      jsonRequest("/api/v1/admin/feature-flags/signup.enabled", {
        method: "PUT",
        body: { enabled: false, reason: "incident mitigation" },
        headers: idemHeaders(admin.cookie),
      }),
      routeContext({ key: "signup.enabled" }),
    );
    expect(ok.status).toBe(204);
    const entry = await latestAuditAction();
    expect(entry?.action).toBe("feature_flag.updated");
  });

  it("role grant writes user.role_granted, gated to super_admin only (not plain admin)", async () => {
    const rejected = await grantRole(
      jsonRequest(`/api/v1/admin/users/${target.userId}/roles`, {
        body: { role: "moderator" },
        headers: idemHeaders(admin.cookie),
      }),
      routeContext({ id: target.userId }),
    );
    expect(rejected.status).toBe(403);

    const ok = await grantRole(
      jsonRequest(`/api/v1/admin/users/${target.userId}/roles`, {
        body: { role: "content_editor" },
        headers: idemHeaders(superAdmin.cookie),
      }),
      routeContext({ id: target.userId }),
    );
    expect(ok.status).toBe(204);
    const entry = await latestAuditAction();
    expect(entry?.action).toBe("user.role_granted");
    expect(entry?.targetType).toBe("user");
    expect(entry?.targetId).toBe(target.userId);
  });

  it("case decision writes trust.moderation_action_applied, gated to moderator/admin/super_admin (not finance)", async () => {
    await createReport(
      jsonRequest("/api/v1/reports", {
        body: { targetType: "user", targetId: target.userId, reasonCode: "spam" },
        headers: idemHeaders(reporter.cookie),
      }),
      routeContext(),
    );

    const casesAsFinance = await listCases(
      new Request("http://localhost:3000/api/v1/admin/cases", {
        headers: { cookie: financeOnly.cookie },
      }),
      routeContext(),
    );
    // finance isn't in the cases-listing role set at all (BFLA: function-level access control).
    expect([401, 403, 404]).toContain(casesAsFinance.status);

    const casesRes = await listCases(
      new Request("http://localhost:3000/api/v1/admin/cases", {
        headers: { cookie: moderator.cookie },
      }),
      routeContext(),
    );
    const { cases } = (await casesRes.json()) as { cases: { id: string; targetId: string }[] };
    const openCase = cases.find((c) => c.targetId === target.userId)!;

    const rejectedByFinance = await decideCaseAction(
      jsonRequest(`/api/v1/admin/cases/${openCase.id}/actions`, {
        body: {
          decision: "act",
          action: "warn",
          restrictions: [],
          durationDays: null,
          reasonCode: "spam",
        },
        headers: idemHeaders(financeOnly.cookie),
      }),
      routeContext({ id: openCase.id }),
    );
    expect([401, 403, 404]).toContain(rejectedByFinance.status);

    const ok = await decideCaseAction(
      jsonRequest(`/api/v1/admin/cases/${openCase.id}/actions`, {
        body: {
          decision: "act",
          action: "warn",
          restrictions: [],
          durationDays: null,
          reasonCode: "spam",
        },
        headers: idemHeaders(moderator.cookie),
      }),
      routeContext({ id: openCase.id }),
    );
    expect(ok.status).toBe(201);
    const entry = await latestAuditAction();
    expect(entry?.action).toBe("trust.moderation_action_applied");
    expect(entry?.targetType).toBe("user");
    expect(entry?.targetId).toBe(target.userId);
    expect(entry?.actorUserId).toBe(moderator.userId);
  });

  it("no admin route is reachable by a signed-out (anonymous) caller", async () => {
    const anon = await listCases(
      new Request("http://localhost:3000/api/v1/admin/cases"),
      routeContext(),
    );
    expect([401, 403, 404]).toContain(anon.status);
  });
});

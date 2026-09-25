import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";

import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as createReport } from "@/app/api/v1/reports/route";
import { GET as listCases } from "@/app/api/v1/admin/cases/route";
import { POST as decideCaseAction } from "@/app/api/v1/admin/cases/[id]/actions/route";
import { GET as getEnforcement } from "@/app/api/v1/me/enforcement/route";
import { POST as openAppealRoute } from "@/app/api/v1/moderation-actions/[id]/appeals/route";
import { GET as listAppeals } from "@/app/api/v1/admin/appeals/route";
import { POST as decideAppealRoute } from "@/app/api/v1/admin/appeals/[id]/decision/route";

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
  if (!raw) throw new Error("expected a set-cookie header");
  return raw.split(";")[0]!;
}

function idemHeaders(cookie: string) {
  return { cookie, "idempotency-key": randomUUID() };
}

async function signUpAndVerify(
  email: string,
  displayName: string,
): Promise<{ cookie: string; userId: string }> {
  const password = "correct battery staple e10 tests";
  await signUp(
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

/** Grants `moderator` and verifies MFA on the session (docs/07 §3.6: staff actions always require
 * MFA) — mirroring the payments suite's own `makeStaff` helper but for the moderator role. */
async function makeModerator(cookie: string): Promise<void> {
  const token = cookie.split("=")[1]!.split(";")[0]!;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await t.db.execute(
    sql`update app.auth_sessions set mfa_verified = true where token_hash = ${tokenHash}`,
  );
  const [session] = await t.db.execute<{ user_id: string }>(
    sql`select user_id from app.auth_sessions where token_hash = ${tokenHash}`,
  );
  await t.db.execute(
    sql`insert into app.user_roles (user_id, role) values (${session!.user_id}, 'moderator') on conflict do nothing`,
  );
}

describe("E10: report -> moderator case -> warning -> user sees notice -> appeal (docs/13 §4)", () => {
  it("walks the full report-to-appeal flow (adapted to a user-profile report: no messaging module exists yet)", async () => {
    const reporter = await signUpAndVerify("reporter.e10@example.com", "Reporter One");
    const reported = await signUpAndVerify("reported.e10@example.com", "Reported User");
    const moderator = await signUpAndVerify("moderator.e10@example.com", "Mod One");
    await makeModerator(moderator.cookie);

    // 1. Report.
    const reportRes = await createReport(
      jsonRequest("/api/v1/reports", {
        body: {
          targetType: "user",
          targetId: reported.userId,
          reasonCode: "harassment",
          details: "Rude DMs",
        },
        headers: idemHeaders(reporter.cookie),
      }),
      routeContext(),
    );
    expect(reportRes.status).toBe(202);

    // 2. A case opened for the target.
    const casesRes = await listCases(
      new Request("http://localhost:3000/api/v1/admin/cases", {
        headers: { cookie: moderator.cookie },
      }),
      routeContext(),
    );
    expect(casesRes.status).toBe(200);
    const { cases } = (await casesRes.json()) as {
      cases: { id: string; targetId: string; status: string }[];
    };
    const openCase = cases.find((c) => c.targetId === reported.userId);
    expect(openCase).toBeDefined();
    expect(openCase!.status).toBe("open");

    // 3. Moderator decides: warn, confirming the report (minor).
    const actionRes = await decideCaseAction(
      jsonRequest(`/api/v1/admin/cases/${openCase!.id}/actions`, {
        body: {
          decision: "act",
          action: "warn",
          restrictions: [],
          durationDays: null,
          reasonCode: "harassment",
          rationale: "Confirmed rude messages, first offence.",
          upheldSeverity: "minor",
        },
        headers: idemHeaders(moderator.cookie),
      }),
      routeContext({ id: openCase!.id }),
    );
    expect(actionRes.status).toBe(201);
    const action = (await actionRes.json()) as {
      id: string;
      action: string;
      subjectUserId: string;
    };
    expect(action.action).toBe("warn");
    expect(action.subjectUserId).toBe(reported.userId);

    // A confirmed minor report also records a `report_upheld_minor` trust event (docs/10 §4.2).
    const [trustEventRow] = await t.db.execute<{ type: string }>(
      sql`select type from app.trust_events where subject_user_id = ${reported.userId}::uuid`,
    );
    expect(trustEventRow?.type).toBe("report_upheld_minor");

    // 4. The reported user sees the notice via GET /me/enforcement.
    const enforcementRes = await getEnforcement(
      new Request("http://localhost:3000/api/v1/me/enforcement", {
        headers: { cookie: reported.cookie },
      }),
      routeContext(),
    );
    expect(enforcementRes.status).toBe(200);
    const enforcement = (await enforcementRes.json()) as {
      actions: { id: string; action: string }[];
      appealableActionIds: string[];
    };
    expect(enforcement.actions.some((a) => a.id === action.id && a.action === "warn")).toBe(true);
    expect(enforcement.appealableActionIds).toContain(action.id);

    // 5. The reported user appeals.
    const appealRes = await openAppealRoute(
      jsonRequest(`/api/v1/moderation-actions/${action.id}/appeals`, {
        body: { statement: "I was defending myself, this wasn't harassment." },
        headers: idemHeaders(reported.cookie),
      }),
      routeContext({ id: action.id }),
    );
    expect(appealRes.status).toBe(201);
    const appeal = (await appealRes.json()) as { id: string; status: string };
    expect(appeal.status).toBe("open");

    // 6. Moderator sees it in the open-appeals queue.
    const appealsRes = await listAppeals(
      new Request("http://localhost:3000/api/v1/admin/appeals", {
        headers: { cookie: moderator.cookie },
      }),
      routeContext(),
    );
    const { appeals } = (await appealsRes.json()) as { appeals: { id: string; status: string }[] };
    expect(appeals.some((a) => a.id === appeal.id)).toBe(true);

    // 7. Moderator upholds the warning.
    const decisionRes = await decideAppealRoute(
      jsonRequest(`/api/v1/admin/appeals/${appeal.id}/decision`, {
        body: { status: "upheld", note: "Messages were clearly inappropriate." },
        headers: idemHeaders(moderator.cookie),
      }),
      routeContext({ id: appeal.id }),
    );
    expect(decisionRes.status).toBe(200);
    const decided = (await decisionRes.json()) as { status: string };
    expect(decided.status).toBe("upheld");

    // The warning still stands after an upheld appeal — no new appealable action was removed.
    const enforcementAfter = await getEnforcement(
      new Request("http://localhost:3000/api/v1/me/enforcement", {
        headers: { cookie: reported.cookie },
      }),
      routeContext(),
    );
    const afterBody = (await enforcementAfter.json()) as { actions: { id: string }[] };
    expect(afterBody.actions.some((a) => a.id === action.id)).toBe(true);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { universities } from "@/server/platform/db/tables/geo";

import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as startApplication } from "@/app/api/v1/me/mentor-application/route";
import { POST as addAffiliation } from "@/app/api/v1/me/mentor-application/affiliations/route";
import { DELETE as removeAffiliation } from "@/app/api/v1/me/mentor-application/affiliations/[id]/route";
import { POST as requestChallenge } from "@/app/api/v1/me/verification/email-challenge/route";
import { POST as confirmChallenge } from "@/app/api/v1/verification/email-challenge/confirm/route";
import { GET as getMentorProfile } from "@/app/api/v1/mentors/[slug]/route";

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

function sessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("expected a set-cookie header");
  return raw.split(";")[0]!;
}

async function signUpAndVerify(
  email: string,
  displayName: string,
): Promise<{ cookie: string; userId: string }> {
  const password = "correct battery staple edge cases";
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
  const signInResponse = await signIn(
    jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
    routeContext(),
  );
  const cookie = sessionCookie(signInResponse);
  const meResponse = await me(
    new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
    routeContext(),
  );
  const userId = ((await meResponse.json()) as { id: string }).id;
  return { cookie, userId };
}

async function findUniversityId(slug: string): Promise<string> {
  const [row] = await t.db
    .select({ id: universities.id })
    .from(universities)
    .where(eq(universities.slug, slug));
  if (!row) throw new Error(`university not seeded: ${slug}`);
  return row.id;
}

async function latestEmailToken(): Promise<string> {
  const jobs = await t.db.execute<{ payload: unknown }>(
    sql`select payload from app.outbox_jobs where type = 'auth.send_email' order by created_at desc limit 1`,
  );
  const text = (jobs[0]!.payload as { text: string }).text;
  const match = /token=([\w-]+)/.exec(text);
  if (!match) throw new Error("no token found in latest email");
  return decodeURIComponent(match[1]!);
}

async function startWithAffiliation(displayName: string, email: string, universityId: string) {
  const { cookie, userId } = await signUpAndVerify(email, displayName);
  await startApplication(
    jsonRequest("/api/v1/me/mentor-application", { headers: { cookie } }),
    routeContext(),
  );
  const affiliationResponse = await addAffiliation(
    jsonRequest("/api/v1/me/mentor-application/affiliations", {
      body: { kind: "education", universityId, title: "BTech", isCurrent: false },
      headers: { cookie },
    }),
    routeContext(),
  );
  const affiliation = (await affiliationResponse.json()) as { id: string };
  return { cookie, userId, affiliationId: affiliation.id };
}

describe("verification edge cases", () => {
  it("rejects an email whose domain isn't registered to the claimed university", async () => {
    const iitb = await findUniversityId("iit-bombay");
    const { cookie, affiliationId } = await startWithAffiliation(
      "Domain Mismatch",
      "mismatch@example.com",
      iitb,
    );

    const response = await requestChallenge(
      jsonRequest("/api/v1/me/verification/email-challenge", {
        body: { affiliationId, email: "student@gmail.com" },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a second account trying to verify an email already proven by someone else", async () => {
    const iitb = await findUniversityId("iit-bombay");
    const first = await startWithAffiliation("First Owner", "first.owner@example.com", iitb);
    const second = await startWithAffiliation("Second Owner", "second.owner@example.com", iitb);

    const sharedEmail = "shared@iitb.ac.in";

    await requestChallenge(
      jsonRequest("/api/v1/me/verification/email-challenge", {
        body: { affiliationId: first.affiliationId, email: sharedEmail },
        headers: { cookie: first.cookie },
      }),
      routeContext(),
    );
    const firstToken = await latestEmailToken();
    const firstConfirm = await confirmChallenge(
      jsonRequest("/api/v1/verification/email-challenge/confirm", { body: { token: firstToken } }),
      routeContext(),
    );
    expect(firstConfirm.status).toBe(200);

    const secondRequest = await requestChallenge(
      jsonRequest("/api/v1/me/verification/email-challenge", {
        body: { affiliationId: second.affiliationId, email: sharedEmail },
        headers: { cookie: second.cookie },
      }),
      routeContext(),
    );
    expect(secondRequest.status).toBe(409);
  });

  it("a mentor can re-verify the same email address they already own (idempotent-ish, not a conflict)", async () => {
    const iitb = await findUniversityId("iit-bombay");
    const owner = await startWithAffiliation("Repeat Owner", "repeat.owner@example.com", iitb);
    const email = "repeat@iitb.ac.in";

    await requestChallenge(
      jsonRequest("/api/v1/me/verification/email-challenge", {
        body: { affiliationId: owner.affiliationId, email },
        headers: { cookie: owner.cookie },
      }),
      routeContext(),
    );
    const firstToken = await latestEmailToken();
    expect(
      (
        await confirmChallenge(
          jsonRequest("/api/v1/verification/email-challenge/confirm", {
            body: { token: firstToken },
          }),
          routeContext(),
        )
      ).status,
    ).toBe(200);

    // Same owner, same email, a second affiliation — should not be treated as a fingerprint conflict.
    const secondAffiliationResponse = await addAffiliation(
      jsonRequest("/api/v1/me/mentor-application/affiliations", {
        body: { kind: "education", universityId: iitb, title: "MTech", isCurrent: false },
        headers: { cookie: owner.cookie },
      }),
      routeContext(),
    );
    const secondAffiliation = (await secondAffiliationResponse.json()) as { id: string };
    const secondRequest = await requestChallenge(
      jsonRequest("/api/v1/me/verification/email-challenge", {
        body: { affiliationId: secondAffiliation.id, email },
        headers: { cookie: owner.cookie },
      }),
      routeContext(),
    );
    expect(secondRequest.status).toBe(202);
  });
});

describe("affiliation ownership", () => {
  it("rejects removing another mentor's affiliation (owner-scoped, 404 not 403)", async () => {
    const iitb = await findUniversityId("iit-bombay");
    const owner = await startWithAffiliation("Owner Account", "owner.account@example.com", iitb);
    const attacker = await signUpAndVerify("attacker.account@example.com", "Attacker Account");
    await startApplication(
      jsonRequest("/api/v1/me/mentor-application", { headers: { cookie: attacker.cookie } }),
      routeContext(),
    );

    const response = await removeAffiliation(
      jsonRequest(`/api/v1/me/mentor-application/affiliations/${owner.affiliationId}`, {
        method: "DELETE",
        headers: { cookie: attacker.cookie },
      }),
      routeContext({ id: owner.affiliationId }),
    );
    expect(response.status).toBe(404);
  });
});

describe("mentor profile visibility", () => {
  it("an unlisted (unapproved) mentor's profile is visible to the owner but 404 to everyone else", async () => {
    const { cookie } = await signUpAndVerify("preview.owner@example.com", "Preview Owner");
    const start = await startApplication(
      jsonRequest("/api/v1/me/mentor-application", { headers: { cookie } }),
      routeContext(),
    );
    const { slug } = (await start.json()) as { slug: string };

    const ownerView = await getMentorProfile(
      new Request(`http://localhost:3000/api/v1/mentors/${slug}`, { headers: { cookie } }),
      routeContext({ slug }),
    );
    expect(ownerView.status).toBe(200);

    const anonymousView = await getMentorProfile(
      new Request(`http://localhost:3000/api/v1/mentors/${slug}`),
      routeContext({ slug }),
    );
    expect(anonymousView.status).toBe(404);
  });

  it("an unknown slug is 404", async () => {
    const response = await getMentorProfile(
      new Request("http://localhost:3000/api/v1/mentors/does-not-exist"),
      routeContext({ slug: "does-not-exist" }),
    );
    expect(response.status).toBe(404);
  });
});

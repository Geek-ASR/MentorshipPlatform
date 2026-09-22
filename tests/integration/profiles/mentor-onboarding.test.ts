import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";

import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";

import {
  POST as startApplication,
  GET as getApplication,
} from "@/app/api/v1/me/mentor-application/route";
import { PATCH as patchProfile } from "@/app/api/v1/me/mentor-application/profile/route";
import { POST as addAffiliation } from "@/app/api/v1/me/mentor-application/affiliations/route";
import { PUT as putExpertise } from "@/app/api/v1/me/mentor-application/expertise/route";
import { PUT as putLanguages } from "@/app/api/v1/me/mentor-application/languages/route";
import { POST as postEligibility } from "@/app/api/v1/me/mentor-application/eligibility/route";
import { POST as submitApplication } from "@/app/api/v1/me/mentor-application/submit/route";
import { POST as reviewApplication } from "@/app/api/v1/admin/mentor-applications/[userId]/review/route";

import { POST as requestChallenge } from "@/app/api/v1/me/verification/email-challenge/route";
import { POST as confirmChallenge } from "@/app/api/v1/verification/email-challenge/confirm/route";

import { GET as searchMentors } from "@/app/api/v1/mentors/route";
import { GET as getMentorProfile } from "@/app/api/v1/mentors/[slug]/route";
import {
  POST as saveMentor,
  DELETE as unsaveMentor,
} from "@/app/api/v1/me/saved-mentors/[mentorUserId]/route";
import { GET as listSaved } from "@/app/api/v1/me/saved-mentors/route";

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

async function signUpAndVerify(email: string, displayName: string): Promise<string> {
  const password = "correct battery staple onboarding";
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
  return sessionCookie(response);
}

/** Test-only: marks the session behind this cookie as MFA-verified and grants the role, like a bootstrapped staff account. */
async function makeStaff(cookie: string, role: "admin"): Promise<void> {
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

async function findTermId(slug: string): Promise<string> {
  const [row] = await t.db
    .select({ id: taxonomyTerms.id })
    .from(taxonomyTerms)
    .where(eq(taxonomyTerms.slug, slug));
  if (!row) throw new Error(`taxonomy term not seeded: ${slug}`);
  return row.id;
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

describe("mentor onboarding, verification and discovery (docs/19 Phase 6 exit criteria)", () => {
  it("takes a mentor from application through verification to being found by search, and lets a student save them", async () => {
    const mentorCookie = await signUpAndVerify("mentor.onboarding@example.com", "Priya Sharma");
    const iitb = await findUniversityId("iit-bombay");
    const systemDesign = await findTermId("system-design");
    const english = await findTermId("english");

    // 1. Start the application.
    const start = await startApplication(
      jsonRequest("/api/v1/me/mentor-application", { headers: { cookie: mentorCookie } }),
      routeContext(),
    );
    expect(start.status).toBe(201);
    const { slug } = (await start.json()) as { slug: string };
    expect(slug).toContain("priya-sharma");

    // 2. Fill in the profile.
    const profilePatch = await patchProfile(
      jsonRequest("/api/v1/me/mentor-application/profile", {
        method: "PATCH",
        body: {
          headline: "Ex-Google SWE, system design mentor",
          bioMd: "I help students prep for interviews.",
        },
        headers: { cookie: mentorCookie },
      }),
      routeContext(),
    );
    expect(profilePatch.status).toBe(204);

    // 3. Add an education affiliation at a real seeded university.
    const affiliationResponse = await addAffiliation(
      jsonRequest("/api/v1/me/mentor-application/affiliations", {
        body: {
          kind: "education",
          universityId: iitb,
          title: "BTech Computer Science",
          isCurrent: false,
        },
        headers: { cookie: mentorCookie },
      }),
      routeContext(),
    );
    expect(affiliationResponse.status).toBe(201);
    const affiliation = (await affiliationResponse.json()) as { id: string };

    // 4. Expertise and languages.
    expect(
      (
        await putExpertise(
          jsonRequest("/api/v1/me/mentor-application/expertise", {
            method: "PUT",
            body: { termIds: [systemDesign] },
            headers: { cookie: mentorCookie },
          }),
          routeContext(),
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await putLanguages(
          jsonRequest("/api/v1/me/mentor-application/languages", {
            method: "PUT",
            body: { languages: [{ termId: english, proficiency: "native" }] },
            headers: { cookie: mentorCookie },
          }),
          routeContext(),
        )
      ).status,
    ).toBe(204);

    // 5. Eligibility attestation — an Indian citizen resolves to "paid" under the default country rules.
    const eligibility = await postEligibility(
      jsonRequest("/api/v1/me/mentor-application/eligibility", {
        body: { countryIso2: "IN", residencyStatus: "citizen_or_pr" },
        headers: { cookie: mentorCookie },
      }),
      routeContext(),
    );
    expect(eligibility.status).toBe(200);
    expect(await eligibility.json()).toEqual({ payoutMode: "paid" });

    // 6. The application is now complete.
    const status = await getApplication(
      new Request("http://localhost:3000/api/v1/me/mentor-application", {
        headers: { cookie: mentorCookie },
      }),
      routeContext(),
    );
    const statusBody = (await status.json()) as { completeness: { complete: boolean } };
    expect(statusBody.completeness.complete).toBe(true);

    // 7. Submit for review.
    expect(
      (
        await submitApplication(
          jsonRequest("/api/v1/me/mentor-application/submit", {
            headers: { cookie: mentorCookie },
          }),
          routeContext(),
        )
      ).status,
    ).toBe(204);

    const meResponse = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie: mentorCookie } }),
      routeContext(),
    );
    const mentorUserId = ((await meResponse.json()) as { id: string }).id;

    // 8. Not listed yet — no credential and not approved.
    const anonymousBefore = await getMentorProfile(
      new Request(`http://localhost:3000/api/v1/mentors/${slug}`),
      routeContext({ slug }),
    );
    expect(anonymousBefore.status).toBe(404);

    // 9. Admin approves.
    const staffCookie = await signUpAndVerify("staff.reviewer@example.com", "Staff Reviewer");
    await makeStaff(staffCookie, "admin");
    const review = await reviewApplication(
      jsonRequest(`/api/v1/admin/mentor-applications/${mentorUserId}/review`, {
        body: { decision: "approved" },
        headers: { cookie: staffCookie },
      }),
      routeContext({ userId: mentorUserId }),
    );
    expect(review.status).toBe(204);

    // 10. Approved but still not listed — no active credential yet.
    const notYetListed = await getMentorProfile(
      new Request(`http://localhost:3000/api/v1/mentors/${slug}`),
      routeContext({ slug }),
    );
    expect(notYetListed.status).toBe(404);

    // 11. Request the email challenge against the real IIT Bombay domain.
    const challengeRequest = await requestChallenge(
      jsonRequest("/api/v1/me/verification/email-challenge", {
        body: { affiliationId: affiliation.id, email: "priya@iitb.ac.in" },
        headers: { cookie: mentorCookie },
      }),
      routeContext(),
    );
    expect(challengeRequest.status).toBe(202);

    const token = await latestEmailToken();
    const confirm = await confirmChallenge(
      jsonRequest("/api/v1/verification/email-challenge/confirm", { body: { token } }),
      routeContext(),
    );
    expect(confirm.status).toBe(200);
    const confirmBody = (await confirm.json()) as { publicLabel: string };
    expect(confirmBody.publicLabel).toContain("Indian Institute of Technology Bombay");

    // 12. Now listed, and visible to an anonymous visitor.
    const publicProfile = await getMentorProfile(
      new Request(`http://localhost:3000/api/v1/mentors/${slug}`),
      routeContext({ slug }),
    );
    expect(publicProfile.status).toBe(200);
    const profileBody = (await publicProfile.json()) as {
      isListed: boolean;
      affiliations: { organizationName: string | null }[];
    };
    expect(profileBody.isListed).toBe(true);
    expect(profileBody.affiliations[0]?.organizationName).toBe(
      "Indian Institute of Technology Bombay",
    );

    // 13. Found by university filter.
    const byUniversity = await searchMentors(
      new Request(`http://localhost:3000/api/v1/mentors?university=${iitb}`),
      routeContext(),
    );
    const byUniversityBody = (await byUniversity.json()) as { mentors: { slug: string }[] };
    expect(byUniversityBody.mentors.map((m) => m.slug)).toContain(slug);

    // 14. Found by keyword search.
    const byKeyword = await searchMentors(
      new Request("http://localhost:3000/api/v1/mentors?q=system+design"),
      routeContext(),
    );
    const byKeywordBody = (await byKeyword.json()) as { mentors: { slug: string }[] };
    expect(byKeywordBody.mentors.map((m) => m.slug)).toContain(slug);

    // 15. A student can save and unsave the mentor.
    const studentCookie = await signUpAndVerify("student.saver@example.com", "Arjun Patel");
    expect(
      (
        await saveMentor(
          jsonRequest(`/api/v1/me/saved-mentors/${mentorUserId}`, {
            headers: { cookie: studentCookie },
          }),
          routeContext({ mentorUserId }),
        )
      ).status,
    ).toBe(204);
    const saved = await listSaved(
      new Request("http://localhost:3000/api/v1/me/saved-mentors", {
        headers: { cookie: studentCookie },
      }),
      routeContext(),
    );
    expect((await saved.json()) as { mentorUserIds: string[] }).toEqual({
      mentorUserIds: [mentorUserId],
    });
    expect(
      (
        await unsaveMentor(
          jsonRequest(`/api/v1/me/saved-mentors/${mentorUserId}`, {
            method: "DELETE",
            headers: { cookie: studentCookie },
          }),
          routeContext({ mentorUserId }),
        )
      ).status,
    ).toBe(204);
    const savedAfter = await listSaved(
      new Request("http://localhost:3000/api/v1/me/saved-mentors", {
        headers: { cookie: studentCookie },
      }),
      routeContext(),
    );
    expect((await savedAfter.json()) as { mentorUserIds: string[] }).toEqual({ mentorUserIds: [] });
  });
});

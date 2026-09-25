import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { findOrderItemByBooking } from "@/server/modules/payments";
import { quoteBooking } from "@/server/modules/payments";

import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as startApplication } from "@/app/api/v1/me/mentor-application/route";
import { PATCH as patchProfile } from "@/app/api/v1/me/mentor-application/profile/route";
import { POST as addAffiliation } from "@/app/api/v1/me/mentor-application/affiliations/route";
import { PUT as putExpertise } from "@/app/api/v1/me/mentor-application/expertise/route";
import { PUT as putLanguages } from "@/app/api/v1/me/mentor-application/languages/route";
import { POST as postEligibility } from "@/app/api/v1/me/mentor-application/eligibility/route";
import { POST as submitApplication } from "@/app/api/v1/me/mentor-application/submit/route";
import { POST as reviewApplication } from "@/app/api/v1/admin/mentor-applications/[userId]/review/route";
import { POST as requestChallenge } from "@/app/api/v1/me/verification/email-challenge/route";
import { POST as confirmChallenge } from "@/app/api/v1/verification/email-challenge/confirm/route";
import { PATCH as patchScheduling } from "@/app/api/v1/me/mentor/scheduling/route";
import { POST as addRule } from "@/app/api/v1/me/mentor/availability-rules/route";
import { POST as createService } from "@/app/api/v1/me/mentor/services/route";
import { GET as getSlots } from "@/app/api/v1/mentors/[slug]/slots/route";
import { POST as createBookingRoute } from "@/app/api/v1/bookings/route";
import { POST as onboardPayoutAccount } from "@/app/api/v1/me/mentor/payout-account/route";
import { POST as createCommissionRule } from "@/app/api/v1/admin/commission-rules/route";

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
  const password = "correct battery staple e11 tests";
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

async function makeAdmin(cookie: string, recentAuth: boolean): Promise<void> {
  const token = cookie.split("=")[1]!.split(";")[0]!;
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await t.db.execute(
    sql`update app.auth_sessions set mfa_verified = true where token_hash = ${tokenHash}`,
  );
  if (!recentAuth) {
    // Push `auth_time` far enough into the past that `requireRecentUserAuth`'s 10-minute default
    // window (docs/07 §5) has elapsed, without needing to wait in real time.
    await t.db.execute(
      sql`update app.auth_sessions set auth_time = now() - interval '1 hour' where token_hash = ${tokenHash}`,
    );
  }
  const [session] = await t.db.execute<{ user_id: string }>(
    sql`select user_id from app.auth_sessions where token_hash = ${tokenHash}`,
  );
  await t.db.execute(
    sql`insert into app.user_roles (user_id, role) values (${session!.user_id}, 'admin') on conflict do nothing`,
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

const PRICE_MINOR = 40_000;

async function setupPaidListedMentor(email: string, name: string, slugHint: string) {
  const mentor = await signUpAndVerify(email, name);
  const iitb = await findUniversityId("iit-bombay");
  const systemDesign = await findTermId("system-design");
  const english = await findTermId("english");

  const start = await startApplication(
    jsonRequest("/api/v1/me/mentor-application", { headers: { cookie: mentor.cookie } }),
    routeContext(),
  );
  const { slug } = (await start.json()) as { slug: string };

  await patchProfile(
    jsonRequest("/api/v1/me/mentor-application/profile", {
      method: "PATCH",
      body: { headline: "Mentor", bioMd: "Bio." },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  const affiliationResponse = await addAffiliation(
    jsonRequest("/api/v1/me/mentor-application/affiliations", {
      body: { kind: "education", universityId: iitb, title: "BTech", isCurrent: false },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  const affiliation = (await affiliationResponse.json()) as { id: string };
  await putExpertise(
    jsonRequest("/api/v1/me/mentor-application/expertise", {
      method: "PUT",
      body: { termIds: [systemDesign] },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  await putLanguages(
    jsonRequest("/api/v1/me/mentor-application/languages", {
      method: "PUT",
      body: { languages: [{ termId: english, proficiency: "native" }] },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  await postEligibility(
    jsonRequest("/api/v1/me/mentor-application/eligibility", {
      body: { countryIso2: "IN", residencyStatus: "citizen_or_pr" },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  await submitApplication(
    jsonRequest("/api/v1/me/mentor-application/submit", { headers: { cookie: mentor.cookie } }),
    routeContext(),
  );

  const staff = await signUpAndVerify(`staff.${slugHint}@example.com`, "Staff Reviewer");
  await makeAdmin(staff.cookie, true);
  await reviewApplication(
    jsonRequest(`/api/v1/admin/mentor-applications/${mentor.userId}/review`, {
      body: { decision: "approved" },
      headers: { cookie: staff.cookie },
    }),
    routeContext({ userId: mentor.userId }),
  );

  await requestChallenge(
    jsonRequest("/api/v1/me/verification/email-challenge", {
      body: { affiliationId: affiliation.id, email: `${slugHint}@iitb.ac.in` },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  const token = await latestEmailToken();
  await confirmChallenge(
    jsonRequest("/api/v1/verification/email-challenge/confirm", { body: { token } }),
    routeContext(),
  );

  await patchScheduling(
    jsonRequest("/api/v1/me/mentor/scheduling", {
      method: "PATCH",
      body: {
        timezone: "UTC",
        minNoticeMin: 60,
        maxAdvanceDays: 90,
        bufferAfterMin: 15,
        slotStepMin: 30,
      },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  for (let weekday = 1; weekday <= 7; weekday++) {
    await addRule(
      jsonRequest("/api/v1/me/mentor/availability-rules", {
        body: { weekday, startLocal: "00:00", endLocal: "23:30", effectiveFrom: todayIso },
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
  }

  await onboardPayoutAccount(
    jsonRequest("/api/v1/me/mentor/payout-account", { headers: idemHeaders(mentor.cookie) }),
    routeContext(),
  );

  const serviceResponse = await createService(
    jsonRequest("/api/v1/me/mentor/services", {
      body: {
        title: "Paid 1:1 mentoring",
        prices: [{ durationMin: 60, priceMinor: PRICE_MINOR, currency: "INR" }],
      },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  const service = (await serviceResponse.json()) as { id: string };

  return { mentor, slug, serviceId: service.id };
}

async function slotAtLeastHoursAway(slug: string, serviceId: string, minHours: number) {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 4 * 86_400_000).toISOString();
  const response = await getSlots(
    new Request(
      `http://localhost:3000/api/v1/mentors/${slug}/slots?serviceId=${serviceId}&durationMin=60&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
    routeContext({ slug }),
  );
  const body = (await response.json()) as { slots: { startsAt: string }[] };
  const cutoff = Date.now() + minHours * 3_600_000;
  const match = body.slots.find((s) => new Date(s.startsAt).getTime() >= cutoff);
  if (!match) throw new Error(`no slot at least ${minHours}h away`);
  return match;
}

describe("E11: admin changes a commission rule with step-up -> new quote reflects it, old booking unchanged (docs/13 §4)", () => {
  it("rejects the change without recent auth, applies it with recent auth, and never touches a prior order item's snapshot", async () => {
    const { mentor, slug, serviceId } = await setupPaidListedMentor(
      "mentor.e11@example.com",
      "E11 Mentor",
      "e11",
    );
    const student = await signUpAndVerify("student.e11@example.com", "E11 Student");

    // --- baseline: quote reflects the default global commission (10%, docs/08's own default) ---
    const before = await quoteBooking(t.db, {
      baseMinor: PRICE_MINOR,
      currency: "INR",
      serviceKind: "one_on_one",
      categoryId: null,
      mentorUserId: mentor.userId,
      promoCode: null,
      now: new Date(),
    });
    expect(before.percentBps).toBe(1000);

    // --- create a real booking (and its order item) under the OLD rate ---
    const slot = await slotAtLeastHoursAway(slug, serviceId, 2);
    const bookingRes = await createBookingRoute(
      jsonRequest("/api/v1/bookings", {
        body: {
          mentorUserId: mentor.userId,
          serviceId,
          durationMin: 60,
          startsAt: slot.startsAt,
          intakeAnswers: [],
        },
        headers: idemHeaders(student.cookie),
      }),
      routeContext(),
    );
    expect(bookingRes.status).toBe(201);
    const { booking } = (await bookingRes.json()) as { booking: { id: string } };
    const orderItemBefore = await findOrderItemByBooking(t.db, booking.id);
    expect(orderItemBefore?.percentBps).toBe(1000);

    // --- a stale-session admin is rejected (docs/07 §5 step-up) ---
    const staleAdmin = await signUpAndVerify("stale.e11@example.com", "Stale Admin");
    await makeAdmin(staleAdmin.cookie, false);
    const rejected = await createCommissionRule(
      jsonRequest("/api/v1/admin/commission-rules", {
        body: { scopeType: "global", percentBps: 1500, priority: 10, reason: "raise take rate" },
        headers: idemHeaders(staleAdmin.cookie),
      }),
      routeContext(),
    );
    expect(rejected.status).toBe(401);
    const rejectedBody = (await rejected.json()) as { code: string };
    expect(rejectedBody.code).toBe("REAUTH_REQUIRED");

    // --- a freshly-authenticated admin succeeds ---
    const freshAdmin = await signUpAndVerify("fresh.e11@example.com", "Fresh Admin");
    await makeAdmin(freshAdmin.cookie, true);
    const applied = await createCommissionRule(
      jsonRequest("/api/v1/admin/commission-rules", {
        body: { scopeType: "global", percentBps: 1500, priority: 10, reason: "raise take rate" },
        headers: idemHeaders(freshAdmin.cookie),
      }),
      routeContext(),
    );
    expect(applied.status).toBe(201);

    // --- a NEW quote reflects the new rate ---
    const after = await quoteBooking(t.db, {
      baseMinor: PRICE_MINOR,
      currency: "INR",
      serviceKind: "one_on_one",
      categoryId: null,
      mentorUserId: mentor.userId,
      promoCode: null,
      now: new Date(),
    });
    expect(after.percentBps).toBe(1500);

    // --- the OLD booking's already-captured order item is untouched (docs/08 §7.3 point 4) ---
    const orderItemAfter = await findOrderItemByBooking(t.db, booking.id);
    expect(orderItemAfter?.percentBps).toBe(1000);
    expect(orderItemAfter?.commissionMinor).toBe(orderItemBefore?.commissionMinor);
  });
});

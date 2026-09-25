import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { silentLogger } from "@tests/helpers/logger";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { createJobRegistry, processDueJobs } from "@/server/platform/outbox/outbox";
import { paymentsJobs } from "@/server/modules/payments";
import {
  runAttendanceFinalizer,
  submitAttendanceClaim,
  findBooking,
  syncPaidBookingsOnce,
} from "@/server/modules/booking";
import { ingestPendingAuditSignals, listActionsForSubject } from "@/server/modules/trust";
import { auditLogs } from "@/server/platform/db/tables/platform";
import { refunds } from "@/server/modules/payments/infra/tables";
import type { UserActor } from "@/server/platform/authz/actor";

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
import { POST as fakeCheckout } from "@/app/api/v1/dev/fake-checkout/route";

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
  const password = "correct battery staple trust tests";
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

async function makeStaff(cookie: string): Promise<void> {
  const token = cookie.split("=")[1]!.split(";")[0]!;
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await t.db.execute(
    sql`update app.auth_sessions set mfa_verified = true where token_hash = ${tokenHash}`,
  );
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

const PRICE_MINOR = 50_000;

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
  await makeStaff(staff.cookie);
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

  const payoutResponse = await onboardPayoutAccount(
    jsonRequest("/api/v1/me/mentor/payout-account", { headers: idemHeaders(mentor.cookie) }),
    routeContext(),
  );
  expect(payoutResponse.status).toBe(201);

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

  return { mentor, staff, slug, serviceId: service.id };
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
  expect(response.status).toBe(200);
  const body = (await response.json()) as { slots: { startsAt: string; endsAt: string }[] };
  expect(body.slots.length).toBeGreaterThan(0);
  const cutoff = Date.now() + minHours * 3_600_000;
  const match = body.slots.find((s) => new Date(s.startsAt).getTime() >= cutoff);
  if (!match) throw new Error(`no slot at least ${minHours}h away`);
  return match;
}

async function createPaidBooking(
  mentorUserId: string,
  slug: string,
  serviceId: string,
  studentCookie: string,
) {
  const slot = await slotAtLeastHoursAway(slug, serviceId, 2);
  const response = await createBookingRoute(
    jsonRequest("/api/v1/bookings", {
      body: {
        mentorUserId,
        serviceId,
        durationMin: 60,
        startsAt: slot.startsAt,
        intakeAnswers: [],
      },
      headers: idemHeaders(studentCookie),
    }),
    routeContext(),
  );
  expect(response.status).toBe(201);
  const created = (await response.json()) as {
    booking: { id: string };
    checkout: { providerOrderId: string } | null;
  };
  expect(created.checkout).not.toBeNull();
  return {
    bookingId: created.booking.id,
    providerOrderId: created.checkout!.providerOrderId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  };
}

async function succeedCheckoutAndProcessWebhook(
  providerOrderId: string,
  studentCookie: string,
): Promise<void> {
  const checkoutRes = await fakeCheckout(
    jsonRequest("/api/v1/dev/fake-checkout", {
      body: { providerOrderId, outcome: "succeed" },
      headers: idemHeaders(studentCookie),
    }),
    routeContext(),
  );
  expect(checkoutRes.status).toBe(200);
  const registry = createJobRegistry(paymentsJobs);
  const result = await processDueJobs(t.db, registry, {
    workerId: "test-worker",
    logger: silentLogger,
  });
  expect(result.completed).toBeGreaterThanOrEqual(1);
  expect(result.failed).toBe(0);
}

describe("E9: mentor no-show -> provisional -> uncontested -> refund + trust event (docs/13 §4)", () => {
  it("auto-refunds the student, ingests a trust event, and auto-warns the mentor once points cross the Level 1 threshold", async () => {
    const { mentor, slug, serviceId } = await setupPaidListedMentor(
      "mentor.noshow@example.com",
      "No Show Mentor",
      "noshow",
    );
    const student = await signUpAndVerify("student.noshow@example.com", "Uma Rao");

    const { bookingId, providerOrderId, startsAt } = await createPaidBooking(
      mentor.userId,
      slug,
      serviceId,
      student.cookie,
    );
    await succeedCheckoutAndProcessWebhook(providerOrderId, student.cookie);
    const syncSummary = await syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000");
    expect(syncSummary.confirmed).toBe(1);

    const confirmed = await findBooking(t.db, bookingId);
    expect(confirmed?.status).toBe("confirmed");

    const studentActor: UserActor = {
      kind: "user",
      userId: student.userId,
      sessionId: randomUUID(),
      roles: new Set(),
      status: "active",
      restrictions: [],
      emailVerified: true,
      mfaVerified: false,
      authenticatedAt: new Date(),
    };

    const start = new Date(startsAt);
    // Move to awaiting_outcome once the session has ended.
    await runAttendanceFinalizer(t.db, new Date(start.getTime() + 65 * 60_000));
    // Student claims mentor absence well after the grace period.
    await submitAttendanceClaim(
      t.db,
      studentActor,
      bookingId,
      "mentor_absent",
      null,
      new Date(start.getTime() + 30 * 60_000),
    );
    // Clear the finalize window (default 2h) uncontested.
    const finalizeAt = new Date(start.getTime() + 4 * 3_600_000);
    await runAttendanceFinalizer(t.db, finalizeAt);

    const resolved = await findBooking(t.db, bookingId);
    expect(resolved?.status).toBe("no_show_mentor");

    // --- refund ---
    const [refundRow] = await t.db
      .select()
      .from(refunds)
      .where(eq(refunds.idempotencyKey, `no-show-refund:${bookingId}`));
    expect(refundRow).toBeDefined();
    expect(refundRow!.amountMinor).toBe(PRICE_MINOR);

    // --- audit signal written by booking, not yet a real trust event ---
    const [signalRow] = await t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "booking.mentor_no_show_signal"));
    expect(signalRow).toBeDefined();
    expect(signalRow!.targetId).toBe(bookingId);

    // --- trust's ingestion poller converts the signal into a real, decaying trust event ---
    const summary = await ingestPendingAuditSignals(t.db, finalizeAt);
    expect(summary.recorded).toBeGreaterThanOrEqual(1);

    const trustEventRows = await t.db.execute<{
      type: string;
      points: number;
      subject_user_id: string;
    }>(
      sql`select type, points, subject_user_id from app.trust_events where source_type = 'booking' and source_id = ${bookingId}::text`,
    );
    expect(trustEventRows).toHaveLength(1);
    expect(trustEventRows[0]!.type).toBe("mentor_no_show");
    expect(trustEventRows[0]!.points).toBe(3);
    expect(trustEventRows[0]!.subject_user_id).toBe(mentor.userId);

    // --- policy engine: mentor_reliability_warning_v1 (sum_points_gte: 3) auto-applies on 3 points ---
    const actions = await listActionsForSubject(t.db, mentor.userId);
    const warnAction = actions.find((a) => a.action === "warn");
    expect(warnAction).toBeDefined();
    expect(warnAction!.reasonCode).toBe("mentor_reliability_warning_v1");

    // Re-running ingestion is idempotent: no duplicate trust event, no duplicate warn.
    const secondSummary = await ingestPendingAuditSignals(t.db, finalizeAt);
    expect(secondSummary.recorded).toBe(0);
    const trustEventRowsAfter = await t.db.execute(
      sql`select 1 from app.trust_events where source_type = 'booking' and source_id = ${bookingId}::text`,
    );
    expect(trustEventRowsAfter).toHaveLength(1);
  });
});

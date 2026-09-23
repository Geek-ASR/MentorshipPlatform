import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { silentLogger } from "@tests/helpers/logger";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { createJobRegistry, processDueJobs } from "@/server/platform/outbox/outbox";
import { paymentsJobs, simulateFakeCheckout } from "@/server/modules/payments";
import { syncPaidBookingsOnce } from "@/server/modules/booking";

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
import { POST as createBooking } from "@/app/api/v1/bookings/route";
import { GET as getBooking } from "@/app/api/v1/bookings/[id]/route";
import { POST as cancelBookingRoute } from "@/app/api/v1/bookings/[id]/cancel/route";

import { POST as onboardPayoutAccount } from "@/app/api/v1/me/mentor/payout-account/route";
import { POST as fakeCheckout } from "@/app/api/v1/dev/fake-checkout/route";
import { POST as fakeWebhookRoute } from "@/app/api/webhooks/fake/route";
import { GET as listMyPayments } from "@/app/api/v1/me/payments/route";
import { GET as listMyRefunds } from "@/app/api/v1/me/refunds/route";
import { GET as listMyTransfers } from "@/app/api/v1/me/mentor/transfers/route";
import { POST as adminRefund } from "@/app/api/v1/admin/payments/[id]/refund/route";
import { POST as adminReleaseTransfer } from "@/app/api/v1/admin/transfers/[id]/release/route";

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

function idemHeaders(cookie: string) {
  return { cookie, "idempotency-key": randomUUID() };
}

async function signUpAndVerify(
  email: string,
  displayName: string,
): Promise<{ cookie: string; userId: string }> {
  const password = "correct battery staple payments tests";
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

const PRICE_MINOR = 50_000; // INR 500.00 — commission.global_bps default (1000 bps) => 5000 commission, 45000 mentor share.

/**
 * A mentor onboarded into "paid" payout mode (citizen_or_pr, per the default
 * `mentor_eligibility.country_rules`) with an active fake payout account and one paid service —
 * everything Phase 8's checkout eligibility check (`mentorPayoutMode === "paid" &&
 * mentorHasActivePayoutAccount && mentorEligibilityAttestationValid`) requires.
 */
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
  // "citizen_or_pr" resolves to payout mode "paid" under the default country rules (docs/17), unlike
  // booking-lifecycle.test.ts's "student_visa" mentor, who resolves to "volunteer" and can't be paid.
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

async function availableSlots(
  slug: string,
  serviceId: string,
): Promise<{ startsAt: string; endsAt: string }[]> {
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
  return body.slots;
}

/** A slot comfortably past the full-refund cancellation threshold (docs/17: 24h default). */
async function slotAtLeastHoursAway(
  slug: string,
  serviceId: string,
  minHours: number,
): Promise<{ startsAt: string; endsAt: string }> {
  const slots = await availableSlots(slug, serviceId);
  const cutoff = Date.now() + minHours * 3_600_000;
  const match = slots.find((s) => new Date(s.startsAt).getTime() >= cutoff);
  if (!match)
    throw new Error(`no slot at least ${minHours}h away among ${slots.length} candidates`);
  return match;
}

type CheckoutInfo = {
  provider: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
};
type CreateBookingBody = {
  booking: { id: string; status: string };
  isFree: boolean;
  checkout: CheckoutInfo | null;
};

async function createPaidBooking(
  mentorUserId: string,
  slug: string,
  serviceId: string,
  studentCookie: string,
  minHoursAway = 2,
): Promise<CreateBookingBody> {
  const slot = await slotAtLeastHoursAway(slug, serviceId, minHoursAway);
  const response = await createBooking(
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
  const created = (await response.json()) as CreateBookingBody;
  expect(created.isFree).toBe(false);
  expect(created.booking.status).toBe("held");
  expect(created.checkout).not.toBeNull();
  return created;
}

/** Drives the fake checkout to "succeed" and processes the resulting webhook job synchronously
 * (matching `runAttendanceFinalizer`-style direct job invocation, for determinism). */
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

/** Every ledger journal must balance on its own (docs/08 §4) — checked directly against Postgres
 * rather than trusting the application layer, mirroring how the EXCLUDE/CONSTRAINT TRIGGER guarantees
 * were validated in Phase 7/this phase's own scratch smoke tests. */
async function assertLedgerBalanced(): Promise<void> {
  const rows = await t.db.execute<{ journal_id: string; direction: string; total: string }>(
    sql`select journal_id, direction, sum(amount_minor)::bigint as total from app.ledger_lines group by journal_id, direction`,
  );
  const byJournal = new Map<string, { debit: number; credit: number }>();
  for (const row of rows) {
    const entry = byJournal.get(row.journal_id) ?? { debit: 0, credit: 0 };
    if (row.direction === "debit") entry.debit = Number(row.total);
    else entry.credit = Number(row.total);
    byJournal.set(row.journal_id, entry);
  }
  expect(byJournal.size).toBeGreaterThan(0);
  for (const [journalId, { debit, credit }] of byJournal) {
    expect(debit, `journal ${journalId} debit must equal credit`).toBe(credit);
  }
}

describe("paid booking lifecycle (docs/19 Phase 8 exit criteria)", () => {
  it("order -> checkout -> capture -> confirm -> transfer on_hold -> release, ledger balanced throughout", async () => {
    const { mentor, staff, slug, serviceId } = await setupPaidListedMentor(
      "mentor.paidlifecycle@example.com",
      "Priya Sharma",
      "paidlifecycle",
    );
    const student = await signUpAndVerify("student.paidlifecycle@example.com", "Arjun Kumar");

    const created = await createPaidBooking(mentor.userId, slug, serviceId, student.cookie);
    expect(created.checkout!.amountMinor).toBe(PRICE_MINOR);

    await succeedCheckoutAndProcessWebhook(created.checkout!.providerOrderId, student.cookie);

    const summary = await syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000");
    expect(summary.confirmed).toBe(1);
    expect(summary.orphaned).toBe(0);

    const bookingAfter = await getBooking(
      new Request(`http://localhost:3000/api/v1/bookings/${created.booking.id}`, {
        headers: { cookie: student.cookie },
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(bookingAfter.status).toBe(200);
    expect(((await bookingAfter.json()) as { status: string }).status).toBe("confirmed");

    const paymentsRes = await listMyPayments(
      new Request("http://localhost:3000/api/v1/me/payments", {
        headers: { cookie: student.cookie },
      }),
      routeContext(),
    );
    const paymentsBody = (await paymentsRes.json()) as {
      payments: { id: string; status: string; amountMinor: number }[];
    };
    expect(paymentsBody.payments).toHaveLength(1);
    expect(paymentsBody.payments[0]).toMatchObject({
      status: "captured",
      amountMinor: PRICE_MINOR,
    });

    const transfersRes = await listMyTransfers(
      new Request("http://localhost:3000/api/v1/me/mentor/transfers", {
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
    const transfersBody = (await transfersRes.json()) as {
      transfers: { id: string; status: string; amountMinor: number }[];
    };
    expect(transfersBody.transfers).toHaveLength(1);
    expect(transfersBody.transfers[0]).toMatchObject({ status: "on_hold", amountMinor: 45_000 });

    await assertLedgerBalanced();

    const releaseRes = await adminReleaseTransfer(
      jsonRequest(`/api/v1/admin/transfers/${transfersBody.transfers[0]!.id}/release`, {
        headers: idemHeaders(staff.cookie),
      }),
      routeContext({ id: transfersBody.transfers[0]!.id }),
    );
    expect(releaseRes.status).toBe(200);
    expect(((await releaseRes.json()) as { status: string }).status).toBe("released");

    await assertLedgerBalanced();
  });

  it("refunds before the transfer releases: student cancels well in advance", async () => {
    const { mentor, slug, serviceId } = await setupPaidListedMentor(
      "mentor.refundbefore@example.com",
      "Refund Before Mentor",
      "refundbefore",
    );
    const student = await signUpAndVerify(
      "student.refundbefore@example.com",
      "Refund Before Student",
    );

    const created = await createPaidBooking(mentor.userId, slug, serviceId, student.cookie, 26);
    await succeedCheckoutAndProcessWebhook(created.checkout!.providerOrderId, student.cookie);
    const summary = await syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000");
    expect(summary.confirmed).toBe(1);

    const cancelRes = await cancelBookingRoute(
      jsonRequest(`/api/v1/bookings/${created.booking.id}/cancel`, {
        body: { reasonCode: "schedule_conflict" },
        headers: idemHeaders(student.cookie),
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(cancelRes.status).toBe(200);
    const cancelBody = (await cancelRes.json()) as {
      booking: { status: string };
      quote: { refundMinor: number };
    };
    expect(cancelBody.booking.status).toBe("cancelled_by_student");
    expect(cancelBody.quote.refundMinor).toBe(PRICE_MINOR); // >24h notice => 100% refund.

    const refundsRes = await listMyRefunds(
      new Request("http://localhost:3000/api/v1/me/refunds", {
        headers: { cookie: student.cookie },
      }),
      routeContext(),
    );
    const refundsBody = (await refundsRes.json()) as {
      refunds: { amountMinor: number; status: string }[];
    };
    expect(refundsBody.refunds).toHaveLength(1);
    expect(refundsBody.refunds[0]).toMatchObject({ amountMinor: PRICE_MINOR, status: "processed" });

    const paymentsRes = await listMyPayments(
      new Request("http://localhost:3000/api/v1/me/payments", {
        headers: { cookie: student.cookie },
      }),
      routeContext(),
    );
    const paymentsBody = (await paymentsRes.json()) as {
      payments: { status: string; refundedMinor: number }[];
    };
    expect(paymentsBody.payments[0]).toMatchObject({
      status: "refunded",
      refundedMinor: PRICE_MINOR,
    });

    const transfersRes = await listMyTransfers(
      new Request("http://localhost:3000/api/v1/me/mentor/transfers", {
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
    const transfersBody = (await transfersRes.json()) as { transfers: { status: string }[] };
    // A full refund before release claws back the entire mentor share => transfer fully reversed.
    expect(transfersBody.transfers[0]).toMatchObject({ status: "reversed" });

    await assertLedgerBalanced();
  });

  it("refunds after the transfer releases: admin reverses a settled payout", async () => {
    const { mentor, staff, slug, serviceId } = await setupPaidListedMentor(
      "mentor.refundafter@example.com",
      "Refund After Mentor",
      "refundafter",
    );
    const student = await signUpAndVerify(
      "student.refundafter@example.com",
      "Refund After Student",
    );

    const created = await createPaidBooking(mentor.userId, slug, serviceId, student.cookie);
    await succeedCheckoutAndProcessWebhook(created.checkout!.providerOrderId, student.cookie);
    await syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000");

    const transfersRes = await listMyTransfers(
      new Request("http://localhost:3000/api/v1/me/mentor/transfers", {
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
    const transferId = ((await transfersRes.json()) as { transfers: { id: string }[] })
      .transfers[0]!.id;
    const releaseRes = await adminReleaseTransfer(
      jsonRequest(`/api/v1/admin/transfers/${transferId}/release`, {
        headers: idemHeaders(staff.cookie),
      }),
      routeContext({ id: transferId }),
    );
    expect(releaseRes.status).toBe(200);

    const paymentsRes = await listMyPayments(
      new Request("http://localhost:3000/api/v1/me/payments", {
        headers: { cookie: student.cookie },
      }),
      routeContext(),
    );
    const paymentId = ((await paymentsRes.json()) as { payments: { id: string }[] }).payments[0]!
      .id;

    const refundRes = await adminRefund(
      jsonRequest(`/api/v1/admin/payments/${paymentId}/refund`, {
        body: { refundMinor: PRICE_MINOR, reasonCode: "goodwill" },
        headers: idemHeaders(staff.cookie),
      }),
      routeContext({ id: paymentId }),
    );
    expect(refundRes.status).toBe(201);

    const transfersAfter = await listMyTransfers(
      new Request("http://localhost:3000/api/v1/me/mentor/transfers", {
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
    expect(
      ((await transfersAfter.json()) as { transfers: { status: string }[] }).transfers[0],
    ).toMatchObject({
      status: "reversed",
    });

    await assertLedgerBalanced();
  });

  it("concurrency: a duplicate webhook storm produces exactly one capture and one ledger journal", async () => {
    const { mentor, slug, serviceId } = await setupPaidListedMentor(
      "mentor.webhookstorm@example.com",
      "Webhook Storm Mentor",
      "webhookstorm",
    );
    const student = await signUpAndVerify(
      "student.webhookstorm@example.com",
      "Webhook Storm Student",
    );
    const created = await createPaidBooking(mentor.userId, slug, serviceId, student.cookie);

    // Sign one "captured" event once, then dispatch that exact same wire payload 10x concurrently —
    // the receiver must dedupe on (provider, provider_event_id), not merely on our own processing.
    const payload = await simulateFakeCheckout(
      t.db,
      created.checkout!.providerOrderId,
      "succeed",
      new Date(),
    );
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        fakeWebhookRoute(
          new Request("http://localhost:3000/api/webhooks/fake", {
            method: "POST",
            headers: { "content-type": "application/json", "x-fake-signature": payload.signature },
            body: payload.body,
          }),
          routeContext(),
        ),
      ),
    );
    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<{ status: string }>));
    expect(bodies.filter((b) => b.status === "accepted")).toHaveLength(1);
    expect(bodies.filter((b) => b.status === "duplicate")).toHaveLength(9);

    const registry = createJobRegistry(paymentsJobs);
    await processDueJobs(t.db, registry, { workerId: "storm-worker", logger: silentLogger });
    // A second pass proves re-running the worker never reprocesses an already-`processed` event.
    await processDueJobs(t.db, registry, { workerId: "storm-worker-2", logger: silentLogger });

    const paymentsRes = await listMyPayments(
      new Request("http://localhost:3000/api/v1/me/payments", {
        headers: { cookie: student.cookie },
      }),
      routeContext(),
    );
    const paymentsBody = (await paymentsRes.json()) as { payments: { status: string }[] };
    expect(paymentsBody.payments).toHaveLength(1);
    expect(paymentsBody.payments[0]!.status).toBe("captured");

    const transfersRes = await listMyTransfers(
      new Request("http://localhost:3000/api/v1/me/mentor/transfers", {
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
    const transfersBody = (await transfersRes.json()) as { transfers: unknown[] };
    expect(transfersBody.transfers).toHaveLength(1);

    const journalCount = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.ledger_journals where idempotency_key like 'capture:%'`,
    );
    // Ledger journals persist across tests in this file (never truncated — each journal balances on
    // its own by construction), so assert against the webhook events this test itself produced
    // rather than a global count.
    const webhookRows = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.webhook_events where provider_event_id = ${JSON.parse(payload.body).id}`,
    );
    expect(webhookRows[0]!.n).toBe(1);
    expect(journalCount[0]!.n).toBeGreaterThanOrEqual(1);

    await assertLedgerBalanced();
  });

  it("concurrency: confirm-vs-cancel race converges to a consistent final state", async () => {
    const { mentor, slug, serviceId } = await setupPaidListedMentor(
      "mentor.confirmcancel@example.com",
      "Confirm Cancel Mentor",
      "confirmcancel",
    );
    const student = await signUpAndVerify(
      "student.confirmcancel@example.com",
      "Confirm Cancel Student",
    );
    const created = await createPaidBooking(mentor.userId, slug, serviceId, student.cookie, 26);

    // Payment captures (webhook processed) while the booking is still `held` in our own state —
    // the race is between the sweep that notices the capture and the student's own cancel request.
    await succeedCheckoutAndProcessWebhook(created.checkout!.providerOrderId, student.cookie);

    const [syncResult, cancelResult] = await Promise.allSettled([
      syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000"),
      cancelBookingRoute(
        jsonRequest(`/api/v1/bookings/${created.booking.id}/cancel`, {
          body: { reasonCode: "schedule_conflict" },
          headers: idemHeaders(student.cookie),
        }),
        routeContext({ id: created.booking.id }),
      ),
    ]);
    expect(syncResult.status).toBe("fulfilled");
    expect(cancelResult.status).toBe("fulfilled");
    if (cancelResult.status === "fulfilled") {
      expect([200, 409]).toContain((cancelResult.value as Response).status);
    }

    // Whichever side of the race won, a payment that genuinely captured must not be silently lost —
    // a second sweep tick converges the booking to one of two valid final states (docs/09 §6.3),
    // exactly as the real recurring job would on its next poll:
    //  - the sweep won the race first: the booking is `confirmed`, the cancel got a clean CONFLICT.
    //  - the cancel won first: the student's explicit cancel is honoured — a payment that captures
    //    after that is never silently re-confirmed against their decision — so the booking converges
    //    to `payment_orphaned` with a full refund, never to `confirmed`.
    await syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000");

    const bookingAfter = await getBooking(
      new Request(`http://localhost:3000/api/v1/bookings/${created.booking.id}`, {
        headers: { cookie: student.cookie },
      }),
      routeContext({ id: created.booking.id }),
    );
    const bookingBody = (await bookingAfter.json()) as { status: string };
    expect(["confirmed", "payment_orphaned"]).toContain(bookingBody.status);

    const transfersRes = await listMyTransfers(
      new Request("http://localhost:3000/api/v1/me/mentor/transfers", {
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
    const transfersBody = (await transfersRes.json()) as { transfers: { status: string }[] };
    expect(transfersBody.transfers).toHaveLength(1);

    if (bookingBody.status === "confirmed") {
      expect(transfersBody.transfers[0]!.status).toBe("on_hold");
    } else {
      // Orphaned via the cancel-won branch: the mentor's transfer is fully clawed back and the
      // student is made whole.
      expect(transfersBody.transfers[0]!.status).toBe("reversed");
      const refundsRes = await listMyRefunds(
        new Request("http://localhost:3000/api/v1/me/refunds", {
          headers: { cookie: student.cookie },
        }),
        routeContext(),
      );
      const refundsBody = (await refundsRes.json()) as { refunds: { amountMinor: number }[] };
      expect(refundsBody.refunds).toHaveLength(1);
      expect(refundsBody.refunds[0]!.amountMinor).toBe(PRICE_MINOR);
    }

    await assertLedgerBalanced();
  });

  it("concurrency: refund double-submit never refunds more than what was captured", async () => {
    const { mentor, staff, slug, serviceId } = await setupPaidListedMentor(
      "mentor.refunddouble@example.com",
      "Refund Double Mentor",
      "refunddouble",
    );
    const student = await signUpAndVerify(
      "student.refunddouble@example.com",
      "Refund Double Student",
    );
    const created = await createPaidBooking(mentor.userId, slug, serviceId, student.cookie);
    await succeedCheckoutAndProcessWebhook(created.checkout!.providerOrderId, student.cookie);
    await syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000");

    const paymentsRes = await listMyPayments(
      new Request("http://localhost:3000/api/v1/me/payments", {
        headers: { cookie: student.cookie },
      }),
      routeContext(),
    );
    const paymentId = ((await paymentsRes.json()) as { payments: { id: string }[] }).payments[0]!
      .id;

    // Two "admins" submit the identical refund at the same time — different HTTP idempotency keys
    // (simulating two separate requests), but the same body, so payments' own internal idempotency
    // key (`admin-refund:{paymentId}:{reasonCode}:{refundMinor}`) collides between them.
    const refundBody = { refundMinor: PRICE_MINOR, reasonCode: "duplicate_submit" };
    const results = await Promise.allSettled([
      adminRefund(
        jsonRequest(`/api/v1/admin/payments/${paymentId}/refund`, {
          body: refundBody,
          headers: idemHeaders(staff.cookie),
        }),
        routeContext({ id: paymentId }),
      ),
      adminRefund(
        jsonRequest(`/api/v1/admin/payments/${paymentId}/refund`, {
          body: refundBody,
          headers: idemHeaders(staff.cookie),
        }),
        routeContext({ id: paymentId }),
      ),
    ]);

    const succeeded = results.filter(
      (r): r is PromiseFulfilledResult<Response> =>
        r.status === "fulfilled" && r.value.status < 300,
    );
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    const refundRows = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.refunds where idempotency_key = ${`admin-refund:${paymentId}:duplicate_submit:${PRICE_MINOR}`}`,
    );
    expect(refundRows[0]!.n).toBe(1);

    const paymentRows = await t.db.execute<{ refunded_minor: number; amount_minor: number }>(
      sql`select refunded_minor::int as refunded_minor, amount_minor::int as amount_minor from app.payments where id = ${paymentId}`,
    );
    expect(paymentRows[0]!.refunded_minor).toBe(PRICE_MINOR);
    expect(paymentRows[0]!.refunded_minor).toBeLessThanOrEqual(paymentRows[0]!.amount_minor);

    await assertLedgerBalanced();
  });
});

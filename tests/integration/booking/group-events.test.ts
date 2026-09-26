import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { silentLogger } from "@tests/helpers/logger";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { createJobRegistry, processDueJobs } from "@/server/platform/outbox/outbox";
import { paymentsJobs } from "@/server/modules/payments";
import {
  bookSeat,
  sweepOverdueMinParticipantsChecks,
  syncPaidBookingsOnce,
} from "@/server/modules/booking";
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

import { POST as onboardPayoutAccount } from "@/app/api/v1/me/mentor/payout-account/route";
import { POST as fakeCheckout } from "@/app/api/v1/dev/fake-checkout/route";
import { POST as grantRole } from "@/app/api/v1/admin/users/[id]/roles/route";

import { POST as createGroupSession } from "@/app/api/v1/me/mentor/group-sessions/route";
import { POST as cancelGroupSessionRoute } from "@/app/api/v1/me/mentor/group-sessions/[id]/cancel/route";
import { POST as bookSeatRoute } from "@/app/api/v1/sessions/[id]/bookings/route";
import { POST as joinWaitlistRoute } from "@/app/api/v1/sessions/[id]/waitlist/route";
import { POST as claimWaitlistOfferRoute } from "@/app/api/v1/waitlist-offers/[id]/claim/route";
import { GET as listMyWaitlist } from "@/app/api/v1/me/waitlist/route";
import { POST as cancelBookingRoute } from "@/app/api/v1/bookings/[id]/cancel/route";

import { POST as createEvent } from "@/app/api/v1/me/events/route";
import { GET as listEvents } from "@/app/api/v1/events/route";
import { GET as getEventBySlugRoute } from "@/app/api/v1/events/[slug]/route";
import { GET as seatCountRoute } from "@/app/api/v1/sessions/[id]/seats/route";
import { POST as createInvite } from "@/app/api/v1/me/events/[id]/invites/route";
import { PUT as setRecording } from "@/app/api/v1/me/events/[id]/recording/route";

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
  const password = "correct battery staple group event tests";
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

async function makeSuperAdmin(cookie: string): Promise<void> {
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
    sql`insert into app.user_roles (user_id, role) values (${session!.user_id}, 'super_admin') on conflict do nothing`,
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

/** An approved mentor in "paid" payout mode with an active fake payout account — everything a
 * group session's creation gate (`requireApprovedPayableMentor`) requires. */
async function setupPayableMentor(email: string, name: string, slugHint: string) {
  const mentor = await signUpAndVerify(email, name);
  const iitb = await findUniversityId("iit-bombay");
  const systemDesign = await findTermId("system-design");
  const english = await findTermId("english");

  await startApplication(
    jsonRequest("/api/v1/me/mentor-application", { headers: { cookie: mentor.cookie } }),
    routeContext(),
  );
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
  await makeSuperAdmin(staff.cookie);
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

  const payoutResponse = await onboardPayoutAccount(
    jsonRequest("/api/v1/me/mentor/payout-account", { headers: idemHeaders(mentor.cookie) }),
    routeContext(),
  );
  expect(payoutResponse.status).toBe(201);

  return { mentor, staff };
}

/** Skips the sign-up/sign-in HTTP ceremony (itself rate-limited, docs/07 §4 — 10/hour per IP) so a
 * concurrency test can race N actors without exhausting that limit; matches the established pattern
 * in tests/integration/booking/concurrency.test.ts. */
async function createStudentActor(label: string): Promise<UserActor> {
  const userId = randomUUID();
  await t.db.execute(sql`
    insert into app.users (id, email, email_verified, display_name, birth_year, adult_attested_at, status)
    values (${userId}, ${`${label}-${userId}@example.com`}, true, ${label}, 2000, now(), 'active')
  `);
  return {
    kind: "user",
    userId,
    sessionId: randomUUID(),
    roles: new Set(),
    status: "active",
    restrictions: [],
    emailVerified: true,
    mfaVerified: false,
    authenticatedAt: new Date(),
  };
}

function farFutureWindow(hoursFromNow: number, durationMin = 90) {
  const start = new Date(Date.now() + hoursFromNow * 3_600_000);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start, end };
}

async function createGroup(
  mentorCookie: string,
  input: {
    title: string;
    capacity: number;
    minParticipants: number;
    targetTotalMinor: number;
    hoursFromNow?: number;
  },
) {
  const { start, end } = farFutureWindow(input.hoursFromNow ?? 48);
  const response = await createGroupSession(
    jsonRequest("/api/v1/me/mentor/group-sessions", {
      body: {
        title: input.title,
        start: start.toISOString(),
        end: end.toISOString(),
        capacity: input.capacity,
        minParticipants: input.minParticipants,
        targetTotalMinor: input.targetTotalMinor,
        currency: "INR",
      },
      headers: idemHeaders(mentorCookie),
    }),
    routeContext(),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as {
    session: { id: string; seatPriceMinor: number };
    seatPriceMinor: number;
  };
}

async function bookSeatFor(studentCookie: string, sessionId: string) {
  return bookSeatRoute(
    jsonRequest(`/api/v1/sessions/${sessionId}/bookings`, {
      body: { intakeAnswers: [] },
      headers: idemHeaders(studentCookie),
    }),
    routeContext({ id: sessionId }),
  );
}

async function payForSeat(studentCookie: string, providerOrderId: string) {
  const checkoutRes = await fakeCheckout(
    jsonRequest("/api/v1/dev/fake-checkout", {
      body: { providerOrderId, outcome: "succeed" },
      headers: idemHeaders(studentCookie),
    }),
    routeContext(),
  );
  expect(checkoutRes.status).toBe(200);
  const registry = createJobRegistry(paymentsJobs);
  await processDueJobs(t.db, registry, { workerId: "test-worker", logger: silentLogger });
  await syncPaidBookingsOnce(t.db, new Date(), "http://localhost:3000");
}

describe("group sessions & free events (docs/19 Phase 9 exit criteria)", () => {
  it("E7: group session below minimum auto-cancels with a full refund at the check deadline", async () => {
    const { mentor } = await setupPayableMentor("mentor.e7@example.com", "E7 Mentor", "e7");
    const studentA = await signUpAndVerify("student.e7a@example.com", "Student A");
    const studentB = await signUpAndVerify("student.e7b@example.com", "Student B");

    // Capacity 5, minimum 3, target ₹3,000 (300000 minor units) -> seat price ₹600 (60000 minor units).
    const { session, seatPriceMinor } = await createGroup(mentor.cookie, {
      title: "System design workshop",
      capacity: 5,
      minParticipants: 3,
      targetTotalMinor: 300_000,
    });
    expect(seatPriceMinor).toBe(60_000);

    // Only 2 seats book and pay — short of the minimum of 3.
    for (const student of [studentA, studentB]) {
      const bookingRes = await bookSeatFor(student.cookie, session.id);
      expect(bookingRes.status).toBe(201);
      const booking = (await bookingRes.json()) as {
        booking: { status: string };
        checkout: { providerOrderId: string } | null;
      };
      expect(booking.booking.status).toBe("held");
      await payForSeat(student.cookie, booking.checkout!.providerOrderId);
    }

    // Advance past the min-participants check deadline (start - 24h) and run the check.
    const wellPastCheck = new Date(Date.now() + 48 * 3_600_000);
    const swept = await sweepOverdueMinParticipantsChecks(t.db, wellPastCheck);
    expect(swept).toBe(1);

    for (const student of [studentA, studentB]) {
      const bookingsRes = await t.db.execute<{
        status: string;
        refunded_minor: number;
        amount_minor: number;
      }>(
        sql`
          select b.status, p.refunded_minor::int as refunded_minor, p.amount_minor::int as amount_minor
          from app.bookings b
          join app.order_items oi on oi.id = b.order_item_id
          join app.payment_intents pi on pi.order_id = oi.order_id
          join app.payments p on p.payment_intent_id = pi.id
          where b.session_id = ${session.id} and b.student_id = (
            select id from app.users where email = ${student.cookie.includes("e7a") ? "student.e7a@example.com" : "student.e7b@example.com"}
          )
        `,
      );
      expect(bookingsRes[0]!.status).toBe("cancelled_system");
      expect(bookingsRes[0]!.refunded_minor).toBe(seatPriceMinor);
      expect(bookingsRes[0]!.amount_minor).toBe(seatPriceMinor);
    }

    // Re-running the sweep is a safe no-op (idempotent).
    expect(await sweepOverdueMinParticipantsChecks(t.db, wellPastCheck)).toBe(0);
  });

  it("E8: a full free event queues a waitlist entry, then auto-promotes it on a cancellation", async () => {
    const { mentor } = await setupPayableMentor("mentor.e8@example.com", "E8 Mentor", "e8");
    await makeSuperAdmin(mentor.cookie); // admin/event_host may host (docs/07 §6.1); reuse super_admin.

    const { start, end } = farFutureWindow(72);
    const eventRes = await createEvent(
      jsonRequest("/api/v1/me/events", {
        body: {
          title: "Ask me anything: applying abroad",
          start: start.toISOString(),
          end: end.toISOString(),
          capacity: 2,
          visibility: "public",
        },
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext(),
    );
    expect(eventRes.status).toBe(201);
    const event = (await eventRes.json()) as { session: { id: string }; details: { slug: string } };

    const studentA = await signUpAndVerify("student.e8a@example.com", "Student A");
    const studentB = await signUpAndVerify("student.e8b@example.com", "Student B");
    const studentC = await signUpAndVerify("student.e8c@example.com", "Student C");

    const regA = await bookSeatFor(studentA.cookie, event.session.id);
    expect(regA.status).toBe(201);
    expect(((await regA.json()) as { booking: { status: string } }).booking.status).toBe(
      "confirmed",
    );
    const regB = await bookSeatFor(studentB.cookie, event.session.id);
    expect(regB.status).toBe(201);
    const bookingB = (await regB.json()) as { booking: { id: string; status: string } };
    expect(bookingB.booking.status).toBe("confirmed");

    // The public count the (cached) event page reads on load is live, and anonymous.
    const seats = await seatCountRoute(
      new Request(`http://localhost:3000/api/v1/sessions/${event.session.id}/seats`),
      routeContext({ id: event.session.id }),
    );
    expect(seats.status).toBe(200);
    expect(await seats.json()).toEqual({ capacity: 2, liveSeats: 2, status: "scheduled" });

    // Event is now full — a third registration attempt is rejected with a waitlist hint.
    const regCFull = await bookSeatFor(studentC.cookie, event.session.id);
    expect(regCFull.status).toBe(409);
    const problem = (await regCFull.json()) as {
      code: string;
      extensions?: { waitlistAvailable?: boolean };
    };
    expect(problem.code).toBe("SLOT_UNAVAILABLE");

    const waitlistRes = await joinWaitlistRoute(
      jsonRequest(`/api/v1/sessions/${event.session.id}/waitlist`, {
        headers: idemHeaders(studentC.cookie),
      }),
      routeContext({ id: event.session.id }),
    );
    expect(waitlistRes.status).toBe(201);
    expect(((await waitlistRes.json()) as { status: string }).status).toBe("waiting");

    // Student B cancels their free registration — no-claim auto-promotion picks up student C.
    const cancelRes = await cancelBookingRoute(
      jsonRequest(`/api/v1/bookings/${bookingB.booking.id}/cancel`, {
        body: { reasonCode: "schedule_conflict" },
        headers: idemHeaders(studentB.cookie),
      }),
      routeContext({ id: bookingB.booking.id }),
    );
    expect(cancelRes.status).toBe(200);

    const cRows = await t.db.execute<{ status: string }>(sql`
      select b.status from app.bookings b
      join app.users u on u.id = b.student_id
      where b.session_id = ${event.session.id} and u.email = 'student.e8c@example.com'
    `);
    expect(cRows).toHaveLength(1);
    expect(cRows[0]!.status).toBe("confirmed"); // auto-promoted, no claim step.

    const myWaitlist = await listMyWaitlist(
      new Request("http://localhost:3000/api/v1/me/waitlist", {
        headers: { cookie: studentC.cookie },
      }),
      routeContext(),
    );
    expect(((await myWaitlist.json()) as { entries: unknown[] }).entries).toHaveLength(0);

    // The event is listed publicly and resolves by slug.
    const listRes = await listEvents(
      new Request("http://localhost:3000/api/v1/events"),
      routeContext(),
    );
    const listed = (await listRes.json()) as { events: { slug: string }[] };
    expect(listed.events.some((e) => e.slug === event.details.slug)).toBe(true);
    const slugRes = await getEventBySlugRoute(
      new Request(`http://localhost:3000/api/v1/events/${event.details.slug}`),
      routeContext({ slug: event.details.slug }),
    );
    expect(slugRes.status).toBe(200);
  });

  it("paid group seat waitlist: a freed seat is offered (not auto-promoted) and claimable", async () => {
    const { mentor } = await setupPayableMentor(
      "mentor.waitlist@example.com",
      "Waitlist Mentor",
      "waitlistgrp",
    );
    const studentA = await signUpAndVerify("student.waitlista@example.com", "Student A");
    const filler = await signUpAndVerify("student.waitlistfiller@example.com", "Filler");
    const studentB = await signUpAndVerify("student.waitlistb@example.com", "Student B");

    // Group sessions need capacity >= 2 (docs/09 §8) — a filler seat fills the session so student B
    // has to wait, then student A's later cancellation is the one seat that frees up.
    const { session } = await createGroup(mentor.cookie, {
      title: "2-seat premium session",
      capacity: 2,
      minParticipants: 1,
      targetTotalMinor: 100_000,
    });

    const bookingA = await bookSeatFor(studentA.cookie, session.id);
    expect(bookingA.status).toBe(201);
    const aBody = (await bookingA.json()) as {
      booking: { id: string };
      checkout: { providerOrderId: string };
    };
    await payForSeat(studentA.cookie, aBody.checkout.providerOrderId);

    const bookingFiller = await bookSeatFor(filler.cookie, session.id);
    expect(bookingFiller.status).toBe(201);
    const fillerBody = (await bookingFiller.json()) as { checkout: { providerOrderId: string } };
    await payForSeat(filler.cookie, fillerBody.checkout.providerOrderId);

    const waitlistRes = await joinWaitlistRoute(
      jsonRequest(`/api/v1/sessions/${session.id}/waitlist`, {
        headers: idemHeaders(studentB.cookie),
      }),
      routeContext({ id: session.id }),
    );
    expect(waitlistRes.status).toBe(201);

    const cancelRes = await cancelBookingRoute(
      jsonRequest(`/api/v1/bookings/${aBody.booking.id}/cancel`, {
        body: { reasonCode: "schedule_conflict" },
        headers: idemHeaders(studentA.cookie),
      }),
      routeContext({ id: aBody.booking.id }),
    );
    expect(cancelRes.status).toBe(200);

    const myWaitlist = await listMyWaitlist(
      new Request("http://localhost:3000/api/v1/me/waitlist", {
        headers: { cookie: studentB.cookie },
      }),
      routeContext(),
    );
    const entries = ((await myWaitlist.json()) as { entries: { id: string; status: string }[] })
      .entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe("offered"); // a claim step, unlike the free-event path.

    const claimRes = await claimWaitlistOfferRoute(
      jsonRequest(`/api/v1/waitlist-offers/${entries[0]!.id}/claim`, {
        body: { intakeAnswers: [] },
        headers: idemHeaders(studentB.cookie),
      }),
      routeContext({ id: entries[0]!.id }),
    );
    expect(claimRes.status).toBe(201);
    const claimed = (await claimRes.json()) as { booking: { status: string } };
    expect(claimed.booking.status).toBe("held");
  });

  it("private event registration requires a valid invite token", async () => {
    const { mentor } = await setupPayableMentor(
      "mentor.private@example.com",
      "Private Mentor",
      "privateevt",
    );
    await makeSuperAdmin(mentor.cookie);
    const student = await signUpAndVerify("student.private@example.com", "Private Student");
    const stranger = await signUpAndVerify("student.stranger@example.com", "Stranger");

    const { start, end } = farFutureWindow(48);
    const eventRes = await createEvent(
      jsonRequest("/api/v1/me/events", {
        body: {
          title: "Invite-only office hours",
          start: start.toISOString(),
          end: end.toISOString(),
          capacity: 5,
          visibility: "private",
        },
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext(),
    );
    const event = (await eventRes.json()) as { session: { id: string } };

    // No token -> invisible, matching the BOLA-safe 404 pattern.
    const noToken = await bookSeatFor(stranger.cookie, event.session.id);
    expect(noToken.status).toBe(404);
    // Its seat count isn't public either.
    const seats = await seatCountRoute(
      new Request(`http://localhost:3000/api/v1/sessions/${event.session.id}/seats`),
      routeContext({ id: event.session.id }),
    );
    expect(seats.status).toBe(404);

    const inviteRes = await createInvite(
      jsonRequest(`/api/v1/me/events/${event.session.id}/invites`, {
        body: {},
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext({ id: event.session.id }),
    );
    expect(inviteRes.status).toBe(201);
    const invite = (await inviteRes.json()) as { token: string };

    // A stranger's guess at the token fails too.
    const wrongToken = await bookSeatRoute(
      jsonRequest(`/api/v1/sessions/${event.session.id}/bookings`, {
        body: { intakeAnswers: [], inviteToken: "not-the-real-token" },
        headers: idemHeaders(stranger.cookie),
      }),
      routeContext({ id: event.session.id }),
    );
    expect(wrongToken.status).toBe(404);

    const withToken = await bookSeatRoute(
      jsonRequest(`/api/v1/sessions/${event.session.id}/bookings`, {
        body: { intakeAnswers: [], inviteToken: invite.token },
        headers: idemHeaders(student.cookie),
      }),
      routeContext({ id: event.session.id }),
    );
    expect(withToken.status).toBe(201);

    // The same (now-used) token can't register a second person.
    const reused = await bookSeatRoute(
      jsonRequest(`/api/v1/sessions/${event.session.id}/bookings`, {
        body: { intakeAnswers: [], inviteToken: invite.token },
        headers: idemHeaders(stranger.cookie),
      }),
      routeContext({ id: event.session.id }),
    );
    expect(reused.status).toBe(404);
  });

  it("mentor cancels a group session: every seat is cancelled and refunded, no double-cancel", async () => {
    const { mentor } = await setupPayableMentor(
      "mentor.cancelgroup@example.com",
      "Cancel Group Mentor",
      "cancelgrp",
    );
    const studentA = await signUpAndVerify("student.cancelgroupa@example.com", "Student A");
    const studentB = await signUpAndVerify("student.cancelgroupb@example.com", "Student B");

    const { session } = await createGroup(mentor.cookie, {
      title: "Cancelled workshop",
      capacity: 5,
      minParticipants: 2,
      targetTotalMinor: 150_000,
    });

    for (const student of [studentA, studentB]) {
      const res = await bookSeatFor(student.cookie, session.id);
      const body = (await res.json()) as { checkout: { providerOrderId: string } };
      await payForSeat(student.cookie, body.checkout.providerOrderId);
    }

    const cancelRes = await cancelGroupSessionRoute(
      jsonRequest(`/api/v1/me/mentor/group-sessions/${session.id}/cancel`, {
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext({ id: session.id }),
    );
    expect(cancelRes.status).toBe(204);

    const rows = await t.db.execute<{ status: string; refunded_minor: number }>(sql`
      select b.status, p.refunded_minor::int as refunded_minor
      from app.bookings b
      join app.order_items oi on oi.id = b.order_item_id
      join app.payment_intents pi on pi.order_id = oi.order_id
      join app.payments p on p.payment_intent_id = pi.id
      where b.session_id = ${session.id}
    `);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("cancelled_system");
      expect(row.refunded_minor).toBeGreaterThan(0);
    }

    // Cancelling an already-cancelled session is rejected, not a silent double-refund.
    const secondCancel = await cancelGroupSessionRoute(
      jsonRequest(`/api/v1/me/mentor/group-sessions/${session.id}/cancel`, {
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext({ id: session.id }),
    );
    expect(secondCancel.status).toBe(409);
  });

  it("recording URL is validated against the allowlist (docs/09 §9)", async () => {
    const { mentor } = await setupPayableMentor(
      "mentor.recording@example.com",
      "Recording Mentor",
      "recordingevt",
    );
    await makeSuperAdmin(mentor.cookie);
    const { start, end } = farFutureWindow(24);
    const eventRes = await createEvent(
      jsonRequest("/api/v1/me/events", {
        body: {
          title: "Recorded session",
          start: start.toISOString(),
          end: end.toISOString(),
          capacity: 10,
          visibility: "public",
        },
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext(),
    );
    const event = (await eventRes.json()) as { session: { id: string } };

    const rejected = await setRecording(
      jsonRequest(`/api/v1/me/events/${event.session.id}/recording`, {
        method: "PUT",
        body: { recordingUrl: "https://evil.example.com/rec.mp4", recordingVisibility: "public" },
        headers: { cookie: mentor.cookie },
      }),
      routeContext({ id: event.session.id }),
    );
    expect(rejected.status).toBe(422);

    const accepted = await setRecording(
      jsonRequest(`/api/v1/me/events/${event.session.id}/recording`, {
        method: "PUT",
        body: {
          recordingUrl: "https://www.youtube.com/watch?v=abc123",
          recordingVisibility: "public",
        },
        headers: { cookie: mentor.cookie },
      }),
      routeContext({ id: event.session.id }),
    );
    expect(accepted.status).toBe(200);

    // A second event over the same time is a field error on the start, not a server error.
    const overlapping = await createEvent(
      jsonRequest("/api/v1/me/events", {
        body: {
          title: "Clashing session",
          start: new Date(start.getTime() + 30 * 60_000).toISOString(),
          end: new Date(end.getTime() + 30 * 60_000).toISOString(),
          capacity: 10,
          visibility: "public",
        },
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext(),
    );
    expect(overlapping.status).toBe(422);
    const problem = (await overlapping.json()) as { errors: { path: string; code: string }[] };
    expect(problem.errors).toEqual([
      expect.objectContaining({ path: "start", code: "time_clash" }),
    ]);
  });

  it("concurrency: two events created at once with the same title both succeed with distinct slugs", async () => {
    const { mentor } = await setupPayableMentor(
      "mentor.slugrace@example.com",
      "Slug Race Mentor",
      "slugrace",
    );
    await makeSuperAdmin(mentor.cookie);
    const windows = [farFutureWindow(200, 30), farFutureWindow(210, 30)];
    // Before this fix, the loser of the check-then-insert race got a 500.
    const responses = await Promise.all(
      windows.map(({ start, end }) =>
        createEvent(
          jsonRequest("/api/v1/me/events", {
            body: {
              title: "Weekly office hours",
              start: start.toISOString(),
              end: end.toISOString(),
              capacity: 5,
              visibility: "public",
            },
            headers: idemHeaders(mentor.cookie),
          }),
          routeContext(),
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const slugs = await Promise.all(
      responses.map(async (r) => ((await r.json()) as { details: { slug: string } }).details.slug),
    );
    expect(new Set(slugs).size).toBe(2);
    expect(slugs.every((slug) => slug.startsWith("weekly-office-hours"))).toBe(true);
  });

  it("admin grants the event_host role via the documented route", async () => {
    const admin = await signUpAndVerify("admin.roles@example.com", "Role Admin");
    await makeSuperAdmin(admin.cookie);
    const target = await signUpAndVerify("target.roles@example.com", "Role Target");

    const res = await grantRole(
      jsonRequest(`/api/v1/admin/users/${target.userId}/roles`, {
        body: { role: "event_host" },
        headers: idemHeaders(admin.cookie),
      }),
      routeContext({ id: target.userId }),
    );
    expect(res.status).toBe(204);

    const rows = await t.db.execute<{ role: string }>(
      sql`select role from app.user_roles where user_id = ${target.userId}`,
    );
    expect(rows.map((r) => r.role)).toContain("event_host");
  });

  it("concurrency: 50 parallel seat requests for capacity 10 leave exactly 10 live seats", async () => {
    const { mentor } = await setupPayableMentor(
      "mentor.capacity@example.com",
      "Capacity Mentor",
      "capacityevt",
    );
    await makeSuperAdmin(mentor.cookie);
    const { start, end } = farFutureWindow(48);
    const eventRes = await createEvent(
      jsonRequest("/api/v1/me/events", {
        body: {
          title: "Capacity stress test",
          start: start.toISOString(),
          end: end.toISOString(),
          capacity: 10,
          visibility: "public",
        },
        headers: idemHeaders(mentor.cookie),
      }),
      routeContext(),
    );
    const event = (await eventRes.json()) as { session: { id: string } };

    // Direct actors (bypassing the rate-limited sign-up/sign-in HTTP flow, docs/07 §4) racing the
    // application function directly — the seat-booking transaction itself is what's under test here,
    // matching concurrency.test.ts's established pattern for N-parallel races.
    const actors = await Promise.all(
      Array.from({ length: 50 }, (_, i) => createStudentActor(`cap-student-${i}`)),
    );
    const now = new Date();
    const results = await Promise.allSettled(
      actors.map((actor) =>
        bookSeat(
          t.db,
          actor,
          { sessionId: event.session.id, intakeAnswers: [] },
          now,
          "http://localhost:3000",
        ),
      ),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(10);

    const liveRows = await t.db.execute<{ n: number }>(sql`
      select count(*)::int as n from app.bookings where session_id = ${event.session.id} and status = 'confirmed'
    `);
    expect(liveRows[0]!.n).toBe(10);
  });

  it("concurrency: a claim and a direct booking racing for one freed seat — exactly one wins", async () => {
    const { mentor } = await setupPayableMentor(
      "mentor.claimrace@example.com",
      "Claim Race Mentor",
      "claimraceevt",
    );
    const studentA = await signUpAndVerify("student.claimracea@example.com", "Student A");
    const filler = await signUpAndVerify("student.claimracefiller@example.com", "Filler");
    const studentB = await signUpAndVerify("student.claimraceb@example.com", "Student B");
    const studentC = await signUpAndVerify("student.claimracec@example.com", "Student C");

    // Group sessions need capacity >= 2 (docs/09 §8) — a filler seat fills the session so the only
    // seat left to race for is the one student A frees by cancelling.
    const { session } = await createGroup(mentor.cookie, {
      title: "Claim race session",
      capacity: 2,
      minParticipants: 1,
      targetTotalMinor: 100_000,
    });

    const bookingA = await bookSeatFor(studentA.cookie, session.id);
    const aBody = (await bookingA.json()) as {
      booking: { id: string };
      checkout: { providerOrderId: string };
    };
    await payForSeat(studentA.cookie, aBody.checkout.providerOrderId);

    const bookingFiller = await bookSeatFor(filler.cookie, session.id);
    const fillerBody = (await bookingFiller.json()) as { checkout: { providerOrderId: string } };
    await payForSeat(filler.cookie, fillerBody.checkout.providerOrderId);

    await joinWaitlistRoute(
      jsonRequest(`/api/v1/sessions/${session.id}/waitlist`, {
        headers: idemHeaders(studentB.cookie),
      }),
      routeContext({ id: session.id }),
    );

    await cancelBookingRoute(
      jsonRequest(`/api/v1/bookings/${aBody.booking.id}/cancel`, {
        body: { reasonCode: "schedule_conflict" },
        headers: idemHeaders(studentA.cookie),
      }),
      routeContext({ id: aBody.booking.id }),
    );

    const myWaitlist = await listMyWaitlist(
      new Request("http://localhost:3000/api/v1/me/waitlist", {
        headers: { cookie: studentB.cookie },
      }),
      routeContext(),
    );
    const offerId = ((await myWaitlist.json()) as { entries: { id: string }[] }).entries[0]!.id;

    // Student B claims the offer while student C races a direct booking for the same freed seat.
    const [claimResult, directResult] = await Promise.allSettled([
      claimWaitlistOfferRoute(
        jsonRequest(`/api/v1/waitlist-offers/${offerId}/claim`, {
          body: { intakeAnswers: [] },
          headers: idemHeaders(studentB.cookie),
        }),
        routeContext({ id: offerId }),
      ),
      bookSeatFor(studentC.cookie, session.id),
    ]);

    const statuses = [claimResult, directResult].map((r) =>
      r.status === "fulfilled" ? r.value.status : 0,
    );
    const successes = statuses.filter((s) => s === 201).length;
    expect(successes).toBe(1);

    const liveRows = await t.db.execute<{ n: number }>(sql`
      select count(*)::int as n from app.bookings
      where session_id = ${session.id} and status IN ('held','confirmed')
    `);
    expect(liveRows[0]!.n).toBe(2); // the filler's confirmed seat + exactly one winner of the race.
  });
});

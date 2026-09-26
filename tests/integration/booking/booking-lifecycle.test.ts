import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { taxonomyTerms } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";

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
import { PATCH as patchService } from "@/app/api/v1/me/mentor/services/[id]/route";
import { joinSession } from "@/server/modules/booking";
import { resolveSessionActor } from "@/server/modules/auth";
import { GET as getSlots } from "@/app/api/v1/mentors/[slug]/slots/route";
import { POST as createBooking } from "@/app/api/v1/bookings/route";
import { GET as getBooking } from "@/app/api/v1/bookings/[id]/route";
import { GET as listMyBookings } from "@/app/api/v1/me/bookings/route";
import { GET as getCancellationQuote } from "@/app/api/v1/bookings/[id]/cancellation-quote/route";
import { POST as cancelBookingRoute } from "@/app/api/v1/bookings/[id]/cancel/route";
import { POST as requestReschedule } from "@/app/api/v1/bookings/[id]/reschedule/route";
import { GET as downloadIcs } from "@/app/api/v1/bookings/[id]/calendar.ics/route";
import { POST as submitClaim } from "@/app/api/v1/bookings/[id]/attendance-claims/route";

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
  const password = "correct battery staple booking tests";
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

/** Full mentor onboarding (docs/19 Phase 6) plus Phase 7 scheduling/service setup, so booking tests
 * can start from a real, listed, bookable mentor rather than re-deriving that vertical slice. */
async function setupListedMentor(email: string, name: string, slugHint: string) {
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
      body: { countryIso2: "IN", residencyStatus: "student_visa" },
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

  // Phase 7: scheduling settings wide open, plus a free service.
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
  // Every weekday, fully open — avoids flakiness from "tomorrow" sometimes being under 24h away
  // late in the day (the window opens at local midnight, not 24h from whenever the test runs).
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
  const serviceResponse = await createService(
    jsonRequest("/api/v1/me/mentor/services", {
      body: {
        title: "Free intro chat",
        prices: [{ durationMin: 60, priceMinor: 0, currency: "INR" }],
      },
      headers: { cookie: mentor.cookie },
    }),
    routeContext(),
  );
  const service = (await serviceResponse.json()) as { id: string };

  return { mentor, slug, serviceId: service.id };
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

async function firstAvailableSlot(
  slug: string,
  serviceId: string,
): Promise<{ startsAt: string; endsAt: string }> {
  return (await availableSlots(slug, serviceId))[0]!;
}

/** A slot comfortably past the self-service reschedule threshold (docs/17: 24h), since the mentor's
 * availability window opens at local midnight and "tomorrow" can be less than 24h away late in the day. */
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

describe("booking lifecycle (docs/19 Phase 7 exit criteria)", () => {
  it("books a free 1:1 session end to end: slots -> create -> view -> cancel", async () => {
    const { mentor, slug, serviceId } = await setupListedMentor(
      "mentor.lifecycle@example.com",
      "Priya Sharma",
      "lifecycle",
    );
    const student = await signUpAndVerify("student.lifecycle@example.com", "Arjun Kumar");

    const slot = await firstAvailableSlot(slug, serviceId);

    const bookingResponse = await createBooking(
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
    expect(bookingResponse.status).toBe(201);
    const created = (await bookingResponse.json()) as {
      booking: { id: string; status: string };
      isFree: boolean;
    };
    expect(created.isFree).toBe(true);
    expect(created.booking.status).toBe("confirmed");

    // Both participants can see it; a stranger cannot.
    const asStudent = await getBooking(
      new Request(`http://localhost:3000/api/v1/bookings/${created.booking.id}`, {
        headers: { cookie: student.cookie },
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(asStudent.status).toBe(200);
    const asMentor = await getBooking(
      new Request(`http://localhost:3000/api/v1/bookings/${created.booking.id}`, {
        headers: { cookie: mentor.cookie },
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(asMentor.status).toBe(200);
    const stranger = await signUpAndVerify("stranger.lifecycle@example.com", "Someone Else");
    const asStranger = await getBooking(
      new Request(`http://localhost:3000/api/v1/bookings/${created.booking.id}`, {
        headers: { cookie: stranger.cookie },
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(asStranger.status).toBe(404);

    // Shows up on both dashboards.
    const studentList = await listMyBookings(
      new Request("http://localhost:3000/api/v1/me/bookings?role=student", {
        headers: { cookie: student.cookie },
      }),
      routeContext(),
    );
    expect(((await studentList.json()) as { bookings: unknown[] }).bookings).toHaveLength(1);
    const mentorList = await listMyBookings(
      new Request("http://localhost:3000/api/v1/me/bookings?role=mentor", {
        headers: { cookie: mentor.cookie },
      }),
      routeContext(),
    );
    expect(((await mentorList.json()) as { bookings: unknown[] }).bookings).toHaveLength(1);

    // A confirmation email went to both parties (console outbox adapter).
    const emailCount = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.outbox_jobs where type = 'auth.send_email'`,
    );
    expect(emailCount[0]!.n).toBeGreaterThanOrEqual(2);

    // ICS download works and reflects the real time.
    const ics = await downloadIcs(
      new Request(`http://localhost:3000/api/v1/bookings/${created.booking.id}/calendar.ics`, {
        headers: { cookie: student.cookie },
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    const icsText = await ics.text();
    expect(icsText).toContain("STATUS:CONFIRMED");

    // Cancellation quote reflects a far-future free booking (100% of ₹0).
    const quote = await getCancellationQuote(
      new Request(
        `http://localhost:3000/api/v1/bookings/${created.booking.id}/cancellation-quote`,
        { headers: { cookie: student.cookie } },
      ),
      routeContext({ id: created.booking.id }),
    );
    expect(quote.status).toBe(200);
    expect((await quote.json()) as { refundMinor: number }).toMatchObject({ refundMinor: 0 });

    // Student cancels; the slot frees up for someone else.
    const cancel = await cancelBookingRoute(
      jsonRequest(`/api/v1/bookings/${created.booking.id}/cancel`, {
        body: { reasonCode: "schedule_conflict" },
        headers: idemHeaders(student.cookie),
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(cancel.status).toBe(200);
    const cancelBody = (await cancel.json()) as { booking: { status: string } };
    expect(cancelBody.booking.status).toBe("cancelled_by_student");

    const reopenedSlots = await getSlots(
      new Request(
        `http://localhost:3000/api/v1/mentors/${slug}/slots?serviceId=${serviceId}&durationMin=60&from=${encodeURIComponent(slot.startsAt)}&to=${encodeURIComponent(slot.endsAt)}`,
      ),
      routeContext({ slug }),
    );
    const reopenedBody = (await reopenedSlots.json()) as { slots: { startsAt: string }[] };
    expect(reopenedBody.slots.some((s) => s.startsAt === slot.startsAt)).toBe(true);
  });

  it("refuses to cancel or move a session once it has started", async () => {
    const { mentor, slug, serviceId } = await setupListedMentor(
      "mentor.started@example.com",
      "Started Mentor",
      "started",
    );
    const student = await signUpAndVerify("student.started@example.com", "Started Student");
    const slot = await firstAvailableSlot(slug, serviceId);
    const bookingResponse = await createBooking(
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
    const { booking } = (await bookingResponse.json()) as { booking: { id: string } };
    // The session is now ten minutes in; the attendance job hasn't settled it yet.
    await t.db.execute(sql`
      update app.sessions set during = tstzrange(now() - interval '10 minutes', now() + interval '50 minutes')
      where id = (select session_id from app.bookings where id = ${booking.id}::uuid)
    `);

    // Before this fix the quote offered the late-cancel courtesy refund for a session under way.
    const quote = await getCancellationQuote(
      new Request(`http://localhost:3000/api/v1/bookings/${booking.id}/cancellation-quote`, {
        headers: { cookie: student.cookie },
      }),
      routeContext({ id: booking.id }),
    );
    expect(quote.status).toBe(409);
    for (const cookie of [student.cookie, mentor.cookie]) {
      const cancel = await cancelBookingRoute(
        jsonRequest(`/api/v1/bookings/${booking.id}/cancel`, {
          body: { reasonCode: "other" },
          headers: idemHeaders(cookie),
        }),
        routeContext({ id: booking.id }),
      );
      expect(cancel.status).toBe(409);
    }
    const move = await requestReschedule(
      jsonRequest(`/api/v1/bookings/${booking.id}/reschedule`, {
        body: { startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
        headers: idemHeaders(student.cookie),
      }),
      routeContext({ id: booking.id }),
    );
    expect(move.status).toBe(409);

    const [row] = await t.db.execute<{ status: string }>(
      sql`select status from app.bookings where id = ${booking.id}::uuid`,
    );
    expect(row!.status).toBe("confirmed");
  });

  it("rejects a duration the service doesn't offer, and returns a machine-readable reason", async () => {
    const { mentor, slug, serviceId } = await setupListedMentor(
      "mentor.reason@example.com",
      "Reason Mentor",
      "reason",
    );
    const student = await signUpAndVerify("student.reason@example.com", "Reason Student");
    const slot = await firstAvailableSlot(slug, serviceId);

    const response = await createBooking(
      jsonRequest("/api/v1/bookings", {
        body: {
          mentorUserId: mentor.userId,
          serviceId,
          durationMin: 45,
          startsAt: slot.startsAt,
          intakeAnswers: [],
        },
        headers: idemHeaders(student.cookie),
      }),
      routeContext(),
    );
    expect(response.status).toBe(422);
    const problem = (await response.json()) as { code: string; reason?: string };
    expect(problem.code).toBe("BOOKING_NOT_ELIGIBLE");
    expect(problem.reason).toBe("INVALID_DURATION");
  });

  it("self-service reschedules a confirmed booking to a new free slot", async () => {
    const { mentor, slug, serviceId } = await setupListedMentor(
      "mentor.resched@example.com",
      "Resched Mentor",
      "resched",
    );
    const student = await signUpAndVerify("student.resched@example.com", "Resched Student");
    const slot = await slotAtLeastHoursAway(slug, serviceId, 26);

    const bookingResponse = await createBooking(
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
    const created = (await bookingResponse.json()) as { booking: { id: string } };

    const allSlots = await getSlots(
      new Request(
        `http://localhost:3000/api/v1/mentors/${slug}/slots?serviceId=${serviceId}&durationMin=60&from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 4 * 86_400_000).toISOString())}`,
      ),
      routeContext({ slug }),
    );
    const otherSlot = ((await allSlots.json()) as { slots: { startsAt: string }[] }).slots.find(
      (s) => s.startsAt !== slot.startsAt,
    )!;

    const reschedule = await requestReschedule(
      jsonRequest(`/api/v1/bookings/${created.booking.id}/reschedule`, {
        body: { startsAt: otherSlot.startsAt },
        headers: idemHeaders(student.cookie),
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(reschedule.status).toBe(200);
    const reschedBody = (await reschedule.json()) as { applied: boolean };
    expect(reschedBody.applied).toBe(true);

    const moved = await getBooking(
      new Request(`http://localhost:3000/api/v1/bookings/${created.booking.id}`, {
        headers: { cookie: student.cookie },
      }),
      routeContext({ id: created.booking.id }),
    );
    const movedBody = (await moved.json()) as { start: string };
    expect(movedBody.start).toBe(otherSlot.startsAt);
  });

  it("rejects an attendance claim before the session has started", async () => {
    const { mentor, slug, serviceId } = await setupListedMentor(
      "mentor.claim@example.com",
      "Claim Mentor",
      "claim",
    );
    const student = await signUpAndVerify("student.claim@example.com", "Claim Student");
    const slot = await firstAvailableSlot(slug, serviceId);

    const bookingResponse = await createBooking(
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
    const created = (await bookingResponse.json()) as { booking: { id: string } };

    const claim = await submitClaim(
      jsonRequest(`/api/v1/bookings/${created.booking.id}/attendance-claims`, {
        body: { outcome: "held" },
        headers: idemHeaders(student.cookie),
      }),
      routeContext({ id: created.booking.id }),
    );
    expect(claim.status).toBe(400);
  });

  // docs/09 §12 (found missing in docs/19 Phase 15a: nothing ever set a meeting link, so "Join"
  // could never succeed).
  describe("meeting links", () => {
    it("rejects links that aren't on the provider allowlist, with a field error", async () => {
      const { mentor } = await setupListedMentor(
        "mentor.badlink@example.com",
        "Bad Link",
        "badlink",
      );
      for (const meetingUrl of [
        "http://meet.google.com/abc-defg-hij",
        "https://evil.example/zoom.us",
        "https://user@zoom.us/j/1",
      ]) {
        const response = await createService(
          jsonRequest("/api/v1/me/mentor/services", {
            body: {
              title: "Review",
              prices: [{ durationMin: 30, priceMinor: 0, currency: "INR" }],
              meetingUrl,
            },
            headers: { cookie: mentor.cookie },
          }),
          routeContext(),
        );
        expect(response.status, meetingUrl).toBe(422);
        const body = (await response.json()) as { errors: { path: string }[] };
        expect(body.errors[0]!.path).toBe("meetingUrl");
      }
    });

    it("stores a link and questions, lets the mentor change them, and join resolves the service's link", async () => {
      const { mentor, slug, serviceId } = await setupListedMentor(
        "mentor.link@example.com",
        "Link Mentor",
        "linkmentor",
      );
      const patch = await patchService(
        jsonRequest(`/api/v1/me/mentor/services/${serviceId}`, {
          method: "PATCH",
          body: {
            meetingUrl: "https://meet.jit.si/aheadly-test-room",
            intakeQuestions: [{ label: "What would you like to cover?" }],
          },
          headers: { cookie: mentor.cookie },
        }),
        routeContext({ id: serviceId }),
      );
      expect(patch.status).toBe(204);
      const [row] = await t.db.execute<{
        meeting_url: string;
        intake_questions: { label: string }[];
      }>(
        sql`select meeting_url, intake_questions from app.mentor_services where id = ${serviceId}`,
      );
      expect(row!.meeting_url).toBe("https://meet.jit.si/aheadly-test-room");
      expect(row!.intake_questions.map((q) => q.label)).toEqual(["What would you like to cover?"]);

      // A booking made before the link existed still gets it: join reads the service's link.
      const student = await signUpAndVerify("student.link@example.com", "Link Student");
      const slot = await firstAvailableSlot(slug, serviceId);
      const booking = await createBooking(
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
      const created = (await booking.json()) as { booking: { id: string } };
      const [session] = await t.db.execute<{ session_id: string }>(
        sql`select session_id from app.bookings where id = ${created.booking.id}`,
      );
      const token = decodeURIComponent(student.cookie.split("=")[1]!);
      const actor = await resolveSessionActor(t.db, token, new Date());
      if (actor.kind !== "user") throw new Error("expected a signed-in student");
      const joined = await joinSession(t.db, actor, session!.session_id, new Date(slot.startsAt));
      expect(joined.meetingUrl).toBe("https://meet.jit.si/aheadly-test-room");

      // Removing the link is allowed; join then has nothing to open.
      await patchService(
        jsonRequest(`/api/v1/me/mentor/services/${serviceId}`, {
          method: "PATCH",
          body: { meetingUrl: null },
          headers: { cookie: mentor.cookie },
        }),
        routeContext({ id: serviceId }),
      );
      const again = await joinSession(t.db, actor, session!.session_id, new Date(slot.startsAt));
      expect(again.meetingUrl).toBeNull();
    });
  });
});

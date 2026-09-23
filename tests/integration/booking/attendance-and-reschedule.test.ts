import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserActor } from "@/server/platform/authz/actor";
import {
  createBooking,
  decideReschedule,
  expirePendingReschedules,
  findBooking,
  requestReschedule,
  runAttendanceFinalizer,
  submitAttendanceClaim,
} from "@/server/modules/booking";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.dispose());

const APP_BASE_URL = "http://localhost:3000";

async function createListedMentor(): Promise<{
  mentorUserId: string;
  serviceId: string;
  actor: UserActor;
}> {
  const mentorUserId = randomUUID();
  const slug = `mentor-${mentorUserId.slice(0, 8)}`;
  await t.db.execute(sql`
    insert into app.users (id, email, email_verified, display_name, birth_year, adult_attested_at, status)
    values (${mentorUserId}, ${`${mentorUserId}@example.com`}, true, 'Attendance Mentor', 2000, now(), 'active')
  `);
  await t.db.execute(sql`
    insert into app.mentor_profiles (user_id, slug, application_status, payout_mode, is_listed)
    values (${mentorUserId}, ${slug}, 'approved', 'volunteer', true)
  `);
  await t.db.execute(sql`
    insert into app.scheduling_settings (mentor_user_id, timezone, slot_step_min, buffer_after_min, min_notice_min, max_advance_days, max_sessions_per_day)
    values (${mentorUserId}, 'UTC', 30, 15, 60, 90, 12)
  `);
  const serviceId = randomUUID();
  await t.db.execute(sql`
    insert into app.mentor_services (id, mentor_user_id, kind, title, allowed_durations_min, is_active)
    values (${serviceId}, ${mentorUserId}, 'one_on_one', 'Free chat', ARRAY[60]::int[], true)
  `);
  await t.db.execute(sql`
    insert into app.service_prices (id, service_id, duration_min, price_minor, currency)
    values (${randomUUID()}, ${serviceId}, 60, 0, 'INR')
  `);
  for (let weekday = 1; weekday <= 7; weekday++) {
    await t.db.execute(sql`
      insert into app.availability_rules (id, mentor_user_id, weekday, start_local, end_local, effective_from)
      values (${randomUUID()}, ${mentorUserId}, ${weekday}, '00:00', '23:45', '2020-01-01')
    `);
  }
  const actor = actorFor(mentorUserId);
  return { mentorUserId, serviceId, actor };
}

function actorFor(userId: string): UserActor {
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

async function createStudentActor(label: string): Promise<UserActor> {
  const userId = randomUUID();
  await t.db.execute(sql`
    insert into app.users (id, email, email_verified, display_name, birth_year, adult_attested_at, status)
    values (${userId}, ${`${label}-${userId}@example.com`}, true, ${label}, 2000, now(), 'active')
  `);
  return actorFor(userId);
}

describe("attendance finalisation (docs/09 §11)", () => {
  it("both silent -> completed only after the silent-complete window, not before", async () => {
    const { mentorUserId, serviceId } = await createListedMentor();
    const student = await createStudentActor("silent-student");
    const bookingCreatedAt = new Date("2026-01-12T00:00:00.000Z");
    const startsAt = new Date("2026-01-12T10:00:00.000Z"); // ends 11:00Z

    const { booking } = await createBooking(
      t.db,
      student,
      { mentorUserId, serviceId, durationMin: 60, startsAt, intakeAnswers: [] },
      bookingCreatedAt,
      APP_BASE_URL,
    );

    // 3 hours after end: session_end_reached fires (moves to awaiting_outcome), but silent-complete
    // (72h default) hasn't matured yet, so it should stay in awaiting_outcome.
    const soonAfterEnd = new Date("2026-01-12T14:00:00.000Z");
    await runAttendanceFinalizer(t.db, soonAfterEnd);
    const midway = await findBooking(t.db, booking.id);
    expect(midway?.status).toBe("awaiting_outcome");

    // 73 hours after end: now it should complete.
    const wellAfterEnd = new Date("2026-01-15T12:30:00.000Z");
    await runAttendanceFinalizer(t.db, wellAfterEnd);
    const done = await findBooking(t.db, booking.id);
    expect(done?.status).toBe("completed");
  });

  it("student claims mentor absent, mentor never signals -> provisional no_show_mentor after the finalise window", async () => {
    const { mentorUserId, serviceId } = await createListedMentor();
    const student = await createStudentActor("noshow-student");
    const createdAt = new Date("2026-01-12T00:00:00.000Z");
    const startsAt = new Date("2026-01-12T10:00:00.000Z");

    const { booking } = await createBooking(
      t.db,
      student,
      { mentorUserId, serviceId, durationMin: 60, startsAt, intakeAnswers: [] },
      createdAt,
      APP_BASE_URL,
    );

    // Move to awaiting_outcome first (session has ended).
    await runAttendanceFinalizer(t.db, new Date("2026-01-12T11:05:00.000Z"));

    // Grace period for a 60-min session is 15 min after start; claim well after that.
    const claimTime = new Date("2026-01-12T10:30:00.000Z");
    await submitAttendanceClaim(t.db, student, booking.id, "mentor_absent", null, claimTime);

    // 3h after end clears the default 2h finalize window.
    await runAttendanceFinalizer(t.db, new Date("2026-01-12T14:00:00.000Z"));
    const resolved = await findBooking(t.db, booking.id);
    expect(resolved?.status).toBe("no_show_mentor");
  });

  it("rejects an 'absent' claim before the no-show grace period has elapsed", async () => {
    const { mentorUserId, serviceId } = await createListedMentor();
    const student = await createStudentActor("early-claim-student");
    const createdAt = new Date("2026-01-12T00:00:00.000Z");
    const startsAt = new Date("2026-01-12T10:00:00.000Z");

    const { booking } = await createBooking(
      t.db,
      student,
      { mentorUserId, serviceId, durationMin: 60, startsAt, intakeAnswers: [] },
      createdAt,
      APP_BASE_URL,
    );

    await expect(
      submitAttendanceClaim(
        t.db,
        student,
        booking.id,
        "mentor_absent",
        null,
        new Date("2026-01-12T10:05:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("reschedule consent flow (docs/09 §7.3)", () => {
  it("requires mentor consent inside 24h, and standing still applies once declined", async () => {
    const { mentorUserId, serviceId, actor: mentorActor } = await createListedMentor();
    const student = await createStudentActor("late-resched-student");
    // Book with only 10 hours' notice — under the 24h self-service threshold.
    const createdAt = new Date("2026-01-12T00:00:00.000Z");
    const startsAt = new Date("2026-01-12T10:00:00.000Z");
    const { booking } = await createBooking(
      t.db,
      student,
      { mentorUserId, serviceId, durationMin: 60, startsAt, intakeAnswers: [] },
      createdAt,
      APP_BASE_URL,
    );

    const requestTime = new Date("2026-01-12T02:00:00.000Z"); // 8h notice, under 24h
    const result = await requestReschedule(
      t.db,
      student,
      booking.id,
      new Date("2026-01-13T10:00:00.000Z"),
      requestTime,
    );
    expect(result.applied).toBe(false);
    expect(result.request.status).toBe("pending");

    const declined = await decideReschedule(
      t.db,
      mentorActor,
      booking.id,
      result.request.id,
      "decline",
      requestTime,
    );
    expect(declined.request.status).toBe("declined");
    const unchanged = await findBooking(t.db, booking.id);
    expect(unchanged?.status).toBe("confirmed");
  });

  it("expires a pending reschedule request past its consent window", async () => {
    const { mentorUserId, serviceId } = await createListedMentor();
    const student = await createStudentActor("expiry-student");
    const createdAt = new Date("2026-01-12T00:00:00.000Z");
    const startsAt = new Date("2026-01-12T10:00:00.000Z");
    const { booking } = await createBooking(
      t.db,
      student,
      { mentorUserId, serviceId, durationMin: 60, startsAt, intakeAnswers: [] },
      createdAt,
      APP_BASE_URL,
    );

    const requestTime = new Date("2026-01-12T02:00:00.000Z");
    await requestReschedule(
      t.db,
      student,
      booking.id,
      new Date("2026-01-13T10:00:00.000Z"),
      requestTime,
    );

    // The consent window is capped at the original start (docs/09 §7.3: "or before the original
    // start, whichever is earlier") — here that's 10:00Z, earlier than requestTime + 12h (14:00Z).
    const expiredCount = await expirePendingReschedules(t.db, new Date("2026-01-12T10:05:00.000Z"));
    expect(expiredCount).toBeGreaterThanOrEqual(1);
    const stillConfirmed = await findBooking(t.db, booking.id);
    expect(stillConfirmed?.status).toBe("confirmed");
  });
});

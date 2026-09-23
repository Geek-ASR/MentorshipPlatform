import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserActor } from "@/server/platform/authz/actor";
import { createBooking } from "@/server/modules/booking";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.dispose());

const APP_BASE_URL = "http://localhost:3000";

/** Inserts rows directly (skipping the full application/verification HTTP ceremony, already
 * covered by booking-lifecycle.test.ts) so these concurrency tests stay fast under N parallel calls. */
async function createListedMentor(input: {
  timezone: string;
  slotStepMin: number;
  bufferAfterMin: number;
  maxSessionsPerDay: number;
}): Promise<{ mentorUserId: string; serviceId: string }> {
  const mentorUserId = randomUUID();
  const slug = `mentor-${mentorUserId.slice(0, 8)}`;
  await t.db.execute(sql`
    insert into app.users (id, email, email_verified, display_name, birth_year, adult_attested_at, status)
    values (${mentorUserId}, ${`${mentorUserId}@example.com`}, true, 'Concurrency Mentor', 2000, now(), 'active')
  `);
  await t.db.execute(sql`
    insert into app.mentor_profiles (user_id, slug, application_status, payout_mode, is_listed)
    values (${mentorUserId}, ${slug}, 'approved', 'volunteer', true)
  `);
  await t.db.execute(sql`
    insert into app.scheduling_settings (mentor_user_id, timezone, slot_step_min, buffer_after_min, min_notice_min, max_advance_days, max_sessions_per_day)
    values (${mentorUserId}, ${input.timezone}, ${input.slotStepMin}, ${input.bufferAfterMin}, 60, 90, ${input.maxSessionsPerDay})
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
  // Wide-open weekly availability so any test instant is bookable regardless of when the suite runs.
  for (let weekday = 1; weekday <= 7; weekday++) {
    await t.db.execute(sql`
      insert into app.availability_rules (id, mentor_user_id, weekday, start_local, end_local, effective_from)
      values (${randomUUID()}, ${mentorUserId}, ${weekday}, '00:00', '23:45', '2020-01-01')
    `);
  }
  return { mentorUserId, serviceId };
}

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

describe("booking concurrency (docs/13 §6)", () => {
  it("exactly one of N parallel bookings for the same overlapping slot succeeds", async () => {
    const { mentorUserId, serviceId } = await createListedMentor({
      timezone: "UTC",
      slotStepMin: 30,
      bufferAfterMin: 15,
      maxSessionsPerDay: 12,
    });
    const now = new Date("2026-01-12T00:00:00.000Z"); // a Monday, matches the wide-open rules
    const startsAt = new Date("2026-01-12T10:00:00.000Z");

    const N = 20;
    const actors = await Promise.all(
      Array.from({ length: N }, (_, i) => createStudentActor(`student-${i}`)),
    );

    const results = await Promise.allSettled(
      actors.map((actor) =>
        createBooking(
          t.db,
          actor,
          { mentorUserId, serviceId, durationMin: 60, startsAt, intakeAnswers: [] },
          now,
          APP_BASE_URL,
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(N - 1);
    // The per-mentor-day advisory lock (docs/09 §6.1) fully serializes these transactions, so most
    // losers see the winner's committed block during their own eligibility re-check
    // (BOOKING_NOT_ELIGIBLE/OUTSIDE_AVAILABILITY) rather than racing the exclusion constraint itself
    // (SLOT_UNAVAILABLE) — both are correct rejections; either is an acceptable outcome here.
    for (const r of rejected) {
      const reason = (r as PromiseRejectedResult).reason;
      expect(["SLOT_UNAVAILABLE", "BOOKING_NOT_ELIGIBLE"]).toContain(
        (reason as { code: string }).code,
      );
    }

    const activeBlocks = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from app.calendar_blocks where mentor_id = ${mentorUserId} and active`,
    );
    expect(activeBlocks[0]!.n).toBe(1);
  });

  it("partially overlapping slots also resolve to exactly one winner", async () => {
    const { mentorUserId, serviceId } = await createListedMentor({
      timezone: "UTC",
      slotStepMin: 15,
      bufferAfterMin: 0,
      maxSessionsPerDay: 12,
    });
    const now = new Date("2026-01-12T00:00:00.000Z");
    // Two overlapping 60-min windows offset by 30 minutes.
    const starts = [new Date("2026-01-12T10:00:00.000Z"), new Date("2026-01-12T10:30:00.000Z")];
    const actors = await Promise.all(starts.map((_, i) => createStudentActor(`overlap-${i}`)));

    const results = await Promise.allSettled(
      actors.map((actor, i) =>
        createBooking(
          t.db,
          actor,
          { mentorUserId, serviceId, durationMin: 60, startsAt: starts[i]!, intakeAnswers: [] },
          now,
          APP_BASE_URL,
        ),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
  });

  it("adjacent slots exactly at the buffer boundary both succeed", async () => {
    const { mentorUserId, serviceId } = await createListedMentor({
      timezone: "UTC",
      slotStepMin: 15,
      bufferAfterMin: 15,
      maxSessionsPerDay: 12,
    });
    const now = new Date("2026-01-12T00:00:00.000Z");
    // 10:00-11:00 then 11:15-12:15 — exactly one buffer-width apart, so both should fit.
    const actorA = await createStudentActor("adjacent-a");
    const actorB = await createStudentActor("adjacent-b");

    const resultA = await createBooking(
      t.db,
      actorA,
      {
        mentorUserId,
        serviceId,
        durationMin: 60,
        startsAt: new Date("2026-01-12T10:00:00.000Z"),
        intakeAnswers: [],
      },
      now,
      APP_BASE_URL,
    );
    const resultB = await createBooking(
      t.db,
      actorB,
      {
        mentorUserId,
        serviceId,
        durationMin: 60,
        startsAt: new Date("2026-01-12T11:15:00.000Z"),
        intakeAnswers: [],
      },
      now,
      APP_BASE_URL,
    );
    expect(resultA.booking.status).toBe("confirmed");
    expect(resultB.booking.status).toBe("confirmed");
  });

  it("at most the daily cap succeeds when many parallel bookings target one mentor-local day", async () => {
    const { mentorUserId, serviceId } = await createListedMentor({
      timezone: "UTC",
      slotStepMin: 30,
      bufferAfterMin: 0,
      maxSessionsPerDay: 4,
    });
    const now = new Date("2026-01-12T00:00:00.000Z");
    const N = 10;
    const actors = await Promise.all(
      Array.from({ length: N }, (_, i) => createStudentActor(`cap-${i}`)),
    );
    // Non-overlapping slots spread across the day so only the daily cap (not the exclusion
    // constraint) limits how many succeed.
    const results = await Promise.allSettled(
      actors.map((actor, i) =>
        createBooking(
          t.db,
          actor,
          {
            mentorUserId,
            serviceId,
            durationMin: 60,
            startsAt: new Date(Date.UTC(2026, 0, 12, 8 + i, 0, 0)),
            intakeAnswers: [],
          },
          now,
          APP_BASE_URL,
        ),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeLessThanOrEqual(4);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
  });
});

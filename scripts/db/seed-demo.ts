import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDatabase, createDatabase } from "../../src/server/platform/db/client";
import { createLogger } from "../../src/server/platform/logger";
import type { Clock } from "../../src/server/platform/clock";
import type { Role, UserActor } from "../../src/server/platform/authz/actor";
import { processDueJobs } from "../../src/server/platform/outbox/outbox";
import { jobRegistry } from "../../src/server/jobs";
import { taxonomyTerms } from "../../src/server/platform/db/tables/reference";
import { companies, universities } from "../../src/server/platform/db/tables/geo";
import {
  alwaysCleanPasswordChecker,
  grantRole,
  rolesForUser,
  signUp,
  users,
} from "../../src/server/modules/auth";
import {
  addMentorAffiliation,
  reviewMentorApplication,
  saveStudentProfile,
  setMentorExpertise,
  setMentorLanguages,
  startMentorApplication,
  submitEligibilityAttestation,
  submitMentorApplication,
  toggleSavedMentor,
  updateMentorContent,
} from "../../src/server/modules/profiles";
import {
  confirmEmailChallenge,
  requestEmailChallenge,
} from "../../src/server/modules/verification";
import {
  addMentorAvailabilityRule,
  bookSeat,
  bookings,
  cancelBooking,
  checkIn,
  createBooking,
  createEvent,
  createGroupSession,
  createMentorService,
  findBooking,
  getAvailableSlots,
  runAttendanceFinalizer,
  submitAttendanceClaim,
  syncPaidBookingsOnce,
  updateSchedulingSettings,
} from "../../src/server/modules/booking";
import {
  createFakeGateway,
  onboardMentorPayoutAccount,
  receiveWebhook,
  simulateFakeCheckout,
} from "../../src/server/modules/payments";
import { createReview, recomputeAllMentorStats } from "../../src/server/modules/trust";
import { createArticle, publishArticle } from "../../src/server/modules/content";
import { loadLocalEnv, requireEnv } from "../lib/load-env";
import {
  DEMO_ACCOUNT_PASSWORD,
  DEMO_EMAIL_DOMAIN,
  EVENTS,
  GROUP_SESSIONS,
  GUIDES,
  MENTORS,
  PAST_SESSIONS,
  SAVED_MENTORS,
  STUDENTS,
  TEAM,
  UPCOMING_SESSIONS,
  type MentorSeed,
} from "./demo/data";

/**
 * Demo data seed (docs/19 Phase 15): fictional mentors, students, sessions, reviews, events and
 * guides, created through the real application services — sign-up, the mentor application, staff
 * approval, the email-challenge verification, the booking transaction, the fake payment provider's
 * signed webhook, check-ins and the attendance finaliser — so every row satisfies the same
 * invariants production data would. Past sessions "time-travel" by passing explicit `now` values.
 *
 * Local, test and preview databases only. Nothing is ever emailed: account addresses use
 * example.com, and every queued email job is deleted before any job is processed.
 */

const DAY = 86_400_000;
const EMAIL_JOB_TYPES = [
  "auth.send_email",
  "booking.send_reminder",
  "booking.send_attendance_prompt",
];

loadLocalEnv();
const appEnv = process.env.APP_ENV ?? "local";
if (appEnv === "staging" || appEnv === "production") {
  console.error(`Refusing to seed demo data into APP_ENV=${appEnv}.`);
  process.exit(1);
}
const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

const db = createDatabase({
  url: requireEnv("DATABASE_URL"),
  maxConnections: 2,
  applicationName: "aheadly-seed-demo",
});
const logger = createLogger({ level: "silent" });

const realNow = new Date(Math.floor(Date.now() / 60_000) * 60_000);
const setupAt = new Date(realNow.getTime() - 75 * DAY);

const fixedClock = (date: Date): Clock => ({ now: () => new Date(date) });
const emailFor = (key: string) => `${key}@${DEMO_EMAIL_DOMAIN}`;
const minutes = (date: Date, count: number) => new Date(date.getTime() + count * 60_000);

type SeededUser = { id: string; key: string };
type SeededMentor = SeededUser & { seed: MentorSeed; serviceIds: string[] };

async function createAccount(key: string, name: string, timezone: string, at: Date) {
  await signUp(
    {
      email: emailFor(key),
      password: DEMO_ACCOUNT_PASSWORD,
      displayName: name,
      birthYear: 1995,
      termsVersion: "v1",
      privacyVersion: "v1",
    },
    {
      db,
      clock: fixedClock(at),
      appBaseUrl,
      ipPrefix: null,
      checkBreached: alwaysCleanPasswordChecker,
    },
  );
  const [row] = await db
    .update(users)
    .set({ emailVerified: true, timezone })
    .where(eq(users.email, emailFor(key)))
    .returning({ id: users.id });
  if (!row) throw new Error(`sign-up did not create ${emailFor(key)}`);
  return row.id;
}

async function actorFor(userId: string, at: Date): Promise<UserActor> {
  const roles = await rolesForUser(db, userId);
  return {
    kind: "user",
    userId,
    sessionId: randomUUID(),
    roles: new Set(roles as Role[]),
    status: "active",
    restrictions: [],
    emailVerified: true,
    mfaVerified: false,
    authenticatedAt: at,
  };
}

async function purgeEmailJobs(): Promise<void> {
  await db.execute(
    sql`DELETE FROM app.outbox_jobs WHERE status = 'pending' AND type IN (${sql.join(
      EMAIL_JOB_TYPES.map((type) => sql`${type}`),
      sql`, `,
    )})`,
  );
}

async function latestTokenFor(recipient: string): Promise<string> {
  const rows = await db.execute<{ payload: { to: string; text: string } }>(
    sql`SELECT payload FROM app.outbox_jobs WHERE type = 'auth.send_email' AND payload->>'to' = ${recipient} ORDER BY created_at DESC LIMIT 1`,
  );
  const text = rows[0]?.payload.text ?? "";
  const match = /token=([\w-]+)/.exec(text);
  if (!match) throw new Error(`no verification token queued for ${recipient}`);
  return decodeURIComponent(match[1]!);
}

async function idsBySlug(table: typeof universities | typeof companies, slugs: string[]) {
  if (slugs.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: table.id, slug: table.slug })
    .from(table)
    .where(inArray(table.slug, slugs));
  return new Map(rows.map((row) => [row.slug, row.id]));
}

async function termIds(vocabulary: "category" | "language", slugs: string[]) {
  const rows = await db
    .select({ id: taxonomyTerms.id, slug: taxonomyTerms.slug })
    .from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.vocabulary, vocabulary), inArray(taxonomyTerms.slug, slugs)));
  const map = new Map(rows.map((row) => [row.slug, row.id]));
  for (const slug of slugs) if (!map.has(slug)) throw new Error(`unknown ${vocabulary} "${slug}"`);
  return map;
}

/** Captures a fake-provider order the way a real checkout would, as of `at`. */
async function payAndConfirm(providerOrderId: string, at: Date): Promise<void> {
  const paidAt = minutes(at, 2);
  const payload = await simulateFakeCheckout(db, providerOrderId, "succeed", paidAt);
  const received = await receiveWebhook(db, "fake", payload.body, payload.signature);
  if (received.status !== "accepted") throw new Error(`webhook ${received.status}`);
  // The job was queued for "now"; backdate it so the capture is processed inside the booking's hold,
  // exactly as it would have been in real time, instead of looking weeks late.
  await db.execute(
    sql`UPDATE app.outbox_jobs SET run_at = ${paidAt.toISOString()}::timestamptz WHERE status = 'pending' AND type = 'payments.process_webhook'`,
  );
  await purgeEmailJobs();
  await processDueJobs(db, jobRegistry, {
    workerId: "demo-seed",
    logger,
    clock: fixedClock(minutes(paidAt, 1)),
  });
  await syncPaidBookingsOnce(db, minutes(paidAt, 2), appBaseUrl);
  // Rows default their timestamps to the database's real clock; the payment history page shows
  // when a payment was made, so it must say when it happened in the seeded timeline.
  await db.execute(
    sql`UPDATE app.payments p SET created_at = ${paidAt.toISOString()}::timestamptz
        FROM app.payment_intents i
        WHERE i.id = p.payment_intent_id AND i.provider_order_id = ${providerOrderId}`,
  );
}

async function findSlot(
  mentor: SeededMentor,
  serviceId: string,
  durationMin: number,
  around: Date,
  window: { notBefore: Date; notAfter: Date },
  bookedAtFor: (dayStart: Date) => Date,
) {
  const aroundDay = Date.UTC(around.getUTCFullYear(), around.getUTCMonth(), around.getUTCDate());
  for (const offset of [0, -1, 1, -2, 2, -3, 3, 4, -4, 5, -5, 6, -6]) {
    const dayStart = new Date(aroundDay + offset * DAY);
    const dayEnd = new Date(dayStart.getTime() + DAY);
    if (dayEnd <= window.notBefore || dayStart >= window.notAfter) continue;
    const bookedAt = bookedAtFor(dayStart);
    const slots = await getAvailableSlots(
      db,
      { mentorUserId: mentor.id, serviceId, durationMin, from: dayStart, to: dayEnd },
      bookedAt,
    );
    const usable = slots.filter((s) => s.start >= window.notBefore && s.end <= window.notAfter);
    if (usable.length > 0) return { slot: usable[Math.floor(usable.length / 2)]!, bookedAt };
  }
  throw new Error(`no slot for ${mentor.key} near ${around.toISOString()}`);
}

function zonedInstant(daysFromNow: number, localTime: string, timeZone: string): Date {
  const [hour, minute] = localTime.split(":").map(Number) as [number, number];
  const date = Temporal.Now.plainDateISO(timeZone).add({ days: daysFromNow });
  const zoned = date.toZonedDateTime({ timeZone, plainTime: new Temporal.PlainTime(hour, minute) });
  return new Date(zoned.epochMilliseconds);
}

async function main(): Promise<void> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, emailFor(TEAM.key)));
  if (existing.length > 0) {
    console.log("Demo data already present — nothing to do. Recreate the database to reseed.");
    return;
  }

  // --- staff account that reviews applications and publishes guides -----------------------------
  const teamId = await createAccount(TEAM.key, TEAM.name, "Asia/Kolkata", setupAt);
  for (const role of ["admin", "content_editor"] as const) await grantRole(db, teamId, role, null);

  // --- mentors, through the real application → approval → verification path ---------------------
  const universityIds = await idsBySlug(
    universities,
    MENTORS.flatMap((m) =>
      m.affiliations.flatMap((a) => (a.universitySlug ? [a.universitySlug] : [])),
    ),
  );
  const companyIds = await idsBySlug(
    companies,
    MENTORS.flatMap((m) => m.affiliations.flatMap((a) => (a.companySlug ? [a.companySlug] : []))),
  );
  const categoryIds = await termIds("category", [
    ...new Set([...MENTORS.flatMap((m) => m.expertise), ...GUIDES.map((g) => g.categorySlug)]),
  ]);
  const languageIds = await termIds("language", [
    ...new Set(MENTORS.flatMap((m) => m.languages.map((l) => l.slug))),
  ]);

  const mentors = new Map<string, SeededMentor>();
  const setupClock = fixedClock(setupAt);
  for (const seed of MENTORS) {
    const id = await createAccount(seed.key, seed.name, seed.timezone, setupAt);
    await db.update(users).set({ countryIso2: seed.countryIso2 }).where(eq(users.id, id));
    await startMentorApplication(db, id, seed.name);
    await updateMentorContent(db, id, { headline: seed.headline, bioMd: seed.bio });

    const affiliationIds: { id: string; verifyWith?: string }[] = [];
    for (const affiliation of seed.affiliations) {
      const row = await addMentorAffiliation(db, id, {
        kind: affiliation.kind,
        universityId: affiliation.universitySlug
          ? universityIds.get(affiliation.universitySlug)
          : undefined,
        companyId: affiliation.companySlug ? companyIds.get(affiliation.companySlug) : undefined,
        title: affiliation.title,
        isCurrent: affiliation.isCurrent,
        startDate: affiliation.startDate,
        endDate: affiliation.endDate,
      });
      affiliationIds.push({ id: row.id, verifyWith: affiliation.verifyWith });
    }

    await setMentorExpertise(
      db,
      id,
      seed.expertise.map((slug) => categoryIds.get(slug)!),
    );
    await setMentorLanguages(
      db,
      id,
      seed.languages.map((l) => ({ termId: languageIds.get(l.slug)!, proficiency: l.proficiency })),
    );
    await submitEligibilityAttestation(
      db,
      id,
      { countryIso2: seed.countryIso2, residencyStatus: seed.residency },
      { clock: setupClock },
    );
    await submitMentorApplication(db, id, setupClock);
    await reviewMentorApplication(db, teamId, id, "approved", setupClock);

    for (const affiliation of affiliationIds) {
      if (!affiliation.verifyWith) continue;
      await requestEmailChallenge(db, id, affiliation.id, affiliation.verifyWith, {
        clock: setupClock,
        appBaseUrl,
      });
      await confirmEmailChallenge(db, await latestTokenFor(affiliation.verifyWith), {
        clock: setupClock,
      });
    }

    await updateSchedulingSettings(
      db,
      id,
      {
        timezone: seed.timezone,
        slotStepMin: 30,
        bufferAfterMin: 15,
        minNoticeMin: 240,
        maxAdvanceDays: 60,
        maxSessionsPerDay: 4,
      },
      setupAt,
    );
    const effectiveFrom = new Date(setupAt.getTime() - DAY).toISOString().slice(0, 10);
    for (const window of seed.availability) {
      for (const weekday of window.weekdays) {
        await addMentorAvailabilityRule(db, id, {
          weekday,
          startLocal: window.start,
          endLocal: window.end,
          effectiveFrom,
        });
      }
    }

    if (seed.residency !== "student_visa") {
      await onboardMentorPayoutAccount(db, createFakeGateway(db), id);
    }
    const serviceIds: string[] = [];
    for (const service of seed.services) {
      const created = await createMentorService(
        db,
        id,
        {
          title: service.title,
          descriptionMd: service.description,
          prices: service.prices.map((p) => ({ ...p, currency: "INR" })),
          // A public Jitsi room per mentor, so "Join" works end to end in the demo (docs/09 §12
          // allowlists meet.jit.si); nothing here identifies a real person.
          meetingUrl: `https://meet.jit.si/aheadly-demo-${seed.key}-${serviceIds.length + 1}`,
          intakeQuestions: service.intakeQuestions?.map((label) => ({ label })),
        },
        setupAt,
      );
      serviceIds.push(created.id);
    }
    if (seed.hostsEvents) await grantRole(db, id, "event_host", teamId);

    mentors.set(seed.key, { id, key: seed.key, seed, serviceIds });
    await purgeEmailJobs();
  }
  console.log(`Mentors: ${mentors.size} approved, verified and bookable.`);

  // --- students ------------------------------------------------------------------------------------
  const students = new Map<string, SeededUser>();
  for (const seed of STUDENTS) {
    const id = await createAccount(seed.key, seed.name, seed.timezone, setupAt);
    if (seed.headline) {
      await saveStudentProfile(db, id, {
        visibility: "booked_mentors_only",
        headline: seed.headline,
      });
    }
    students.set(seed.key, { id, key: seed.key });
  }
  await purgeEmailJobs();
  console.log(`Students: ${students.size}.`);

  // --- past sessions: booked, paid, attended, completed and (mostly) reviewed ---------------------
  const pastWindow = { notBefore: setupAt, notAfter: new Date(realNow.getTime() - 26 * 3_600_000) };
  let reviewCount = 0;
  for (const past of [...PAST_SESSIONS].sort((a, b) => b.daysAgo - a.daysAgo)) {
    const mentor = mentors.get(past.mentor)!;
    const student = students.get(past.student)!;
    const serviceId = mentor.serviceIds[past.service]!;
    const { slot, bookedAt } = await findSlot(
      mentor,
      serviceId,
      past.durationMin,
      new Date(realNow.getTime() - past.daysAgo * DAY),
      pastWindow,
      (dayStart) => new Date(dayStart.getTime() - 3 * DAY),
    );
    const studentActor = await actorFor(student.id, bookedAt);
    const created = await createBooking(
      db,
      studentActor,
      {
        mentorUserId: mentor.id,
        serviceId,
        durationMin: past.durationMin,
        startsAt: slot.start,
        intakeAnswers: [],
      },
      bookedAt,
      appBaseUrl,
    );
    if (created.checkout) await payAndConfirm(created.checkout.providerOrderId, bookedAt);

    const booking = await findBooking(db, created.booking.id);
    if (booking?.status !== "confirmed") {
      throw new Error(`past booking for ${past.mentor}/${past.student} is ${booking?.status}`);
    }
    const mentorActor = await actorFor(mentor.id, slot.start);
    await checkIn(db, studentActor, booking.sessionId, minutes(slot.start, 1));
    await checkIn(db, mentorActor, booking.sessionId, minutes(slot.start, 2));
    // Both answer the post-session "did it happen?" prompt, which finalises after 2h instead of the
    // 72h silent-completion window (docs/09 §11).
    await runAttendanceFinalizer(db, minutes(slot.end, 1));
    await submitAttendanceClaim(db, studentActor, booking.id, "held", null, minutes(slot.end, 20));
    await submitAttendanceClaim(db, mentorActor, booking.id, "held", null, minutes(slot.end, 35));
    await runAttendanceFinalizer(db, minutes(slot.end, 180));
    const completed = await findBooking(db, booking.id);
    if (completed?.status !== "completed") {
      throw new Error(`past booking for ${past.mentor}/${past.student} is ${completed?.status}`);
    }
    await db.update(bookings).set({ createdAt: bookedAt }).where(eq(bookings.id, booking.id));

    if (past.review && past.rating) {
      const review = await createReview(
        db,
        student.id,
        booking.id,
        { rating: past.rating, body: past.review },
        minutes(slot.end, 240),
      );
      const reviewedAt = minutes(slot.end, 60 * (6 + (reviewCount % 30)));
      await db.execute(
        sql`UPDATE app.reviews SET created_at = ${reviewedAt.toISOString()}::timestamptz, updated_at = ${reviewedAt.toISOString()}::timestamptz WHERE id = ${review.id}`,
      );
      reviewCount += 1;
    }
    await purgeEmailJobs();
  }
  console.log(`Past sessions: ${PAST_SESSIONS.length} completed, ${reviewCount} reviewed.`);

  // --- upcoming sessions ---------------------------------------------------------------------------
  const upcomingWindow = {
    notBefore: new Date(realNow.getTime() + 6 * 3_600_000),
    notAfter: new Date(realNow.getTime() + 20 * DAY),
  };
  const bookedRecently = new Date(realNow.getTime() - 45 * 60_000);
  for (const upcoming of UPCOMING_SESSIONS) {
    const mentor = mentors.get(upcoming.mentor)!;
    const student = students.get(upcoming.student)!;
    const serviceId = mentor.serviceIds[upcoming.service]!;
    const { slot } = await findSlot(
      mentor,
      serviceId,
      upcoming.durationMin,
      new Date(realNow.getTime() + upcoming.inDays * DAY),
      upcomingWindow,
      () => bookedRecently,
    );
    const studentActor = await actorFor(student.id, bookedRecently);
    const created = await createBooking(
      db,
      studentActor,
      {
        mentorUserId: mentor.id,
        serviceId,
        durationMin: upcoming.durationMin,
        startsAt: slot.start,
        intakeAnswers: [],
      },
      bookedRecently,
      appBaseUrl,
    );
    if (created.checkout) await payAndConfirm(created.checkout.providerOrderId, bookedRecently);
    if (upcoming.cancelled) {
      await cancelBooking(
        db,
        studentActor,
        created.booking.id,
        { reasonCode: "schedule_conflict", note: "Clashes with a university exam." },
        minutes(bookedRecently, 20),
        appBaseUrl,
      );
    }
    await purgeEmailJobs();
  }
  console.log(`Upcoming sessions: ${UPCOMING_SESSIONS.length}.`);

  // --- free events and a split-cost group session --------------------------------------------------
  const createdAt = new Date(realNow.getTime() - 3 * DAY);
  for (const event of EVENTS) {
    const host = mentors.get(event.host)!;
    const start = zonedInstant(event.inDays, event.localStart, host.seed.timezone);
    const { session } = await createEvent(
      db,
      await actorFor(host.id, createdAt),
      {
        title: event.title,
        descriptionMd: event.description,
        start,
        end: minutes(start, event.durationMin),
        capacity: event.capacity,
        visibility: "public",
      },
      createdAt,
    );
    for (const [index, key] of event.attendees.entries()) {
      const student = students.get(key)!;
      const registeredAt = minutes(createdAt, 90 + index * 173);
      await bookSeat(
        db,
        await actorFor(student.id, registeredAt),
        { sessionId: session.id, intakeAnswers: [] },
        registeredAt,
        appBaseUrl,
      );
    }
    await purgeEmailJobs();
  }
  for (const group of GROUP_SESSIONS) {
    const host = mentors.get(group.host)!;
    const start = zonedInstant(group.inDays, group.localStart, host.seed.timezone);
    const { session } = await createGroupSession(
      db,
      host.id,
      {
        title: group.title,
        descriptionMd: group.description,
        start,
        end: minutes(start, group.durationMin),
        capacity: group.capacity,
        minParticipants: group.minParticipants,
        targetTotalMinor: group.targetTotalMinor,
        currency: "INR",
      },
      createdAt,
    );
    for (const key of group.attendees) {
      const student = students.get(key)!;
      const seat = await bookSeat(
        db,
        await actorFor(student.id, bookedRecently),
        { sessionId: session.id, intakeAnswers: [] },
        bookedRecently,
        appBaseUrl,
      );
      if (seat.checkout) await payAndConfirm(seat.checkout.providerOrderId, bookedRecently);
    }
    await purgeEmailJobs();
  }
  console.log(`Events: ${EVENTS.length} free, ${GROUP_SESSIONS.length} group session(s).`);

  // --- saved mentors -------------------------------------------------------------------------------
  for (const saved of SAVED_MENTORS) {
    const student = students.get(saved.student)!;
    for (const key of saved.mentors) {
      await toggleSavedMentor(db, student.id, mentors.get(key)!.id, true);
    }
  }

  // --- guides written by mentors, published by the team --------------------------------------------
  for (const guide of GUIDES) {
    const author = mentors.get(guide.author)!;
    await db.transaction(async (tx) => {
      const created = await createArticle(tx, author.id, {
        title: guide.title,
        dek: guide.dek,
        bodyMd: guide.body,
        categoryTermId: categoryIds.get(guide.categorySlug)!,
        countryIso2: guide.countryIso2,
        universityId: null,
        sourceType: "mentor_experience",
        sources: guide.sources.map((s) => ({
          ...s,
          accessedAt: new Date(realNow.getTime() - 14 * DAY).toISOString().slice(0, 10),
        })),
        disclaimerKind: guide.disclaimerKind,
        appliesToIntake: guide.appliesToIntake,
      });
      await publishArticle(tx, teamId, created.id);
    });
  }
  console.log(`Guides: ${GUIDES.length} published.`);

  // --- derived data ----------------------------------------------------------------------------------
  await recomputeAllMentorStats(db, realNow);
  await purgeEmailJobs();

  console.log(
    `\nDemo data ready. Sign in as any demo account (e.g. ishaan@${DEMO_EMAIL_DOMAIN}, ananya@${DEMO_EMAIL_DOMAIN}) with the password "${DEMO_ACCOUNT_PASSWORD}".`,
  );
}

try {
  await main();
} finally {
  await closeDatabase(db);
}

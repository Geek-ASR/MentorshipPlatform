import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { mentorProfiles } from "@/server/modules/profiles";
import {
  createCheckout,
  createFakeGateway,
  onboardMentorPayoutAccount,
  simulateFakeCheckout,
  sweepExpiredPaymentIntents,
} from "@/server/modules/payments";

import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";

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

async function signUpAndVerify(email: string, displayName: string): Promise<{ userId: string }> {
  const password = "correct battery staple chaos tests";
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
  const signInRes = await signIn(
    jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
    routeContext(),
  );
  const cookie = sessionCookie(signInRes);
  const meResponse = await me(
    new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
    routeContext(),
  );
  const userId = ((await meResponse.json()) as { id: string }).id;
  return { userId };
}

async function seedStudentAndMentor(
  tag: string,
): Promise<{ studentId: string; mentorUserId: string }> {
  const { userId: studentId } = await signUpAndVerify(
    `student.${tag}@example.com`,
    "Chaos Student",
  );
  const { userId: mentorUserId } = await signUpAndVerify(
    `mentor.${tag}@example.com`,
    "Chaos Mentor",
  );
  await t.db.insert(mentorProfiles).values({ userId: mentorUserId, slug: `chaos-mentor-${tag}` });
  // A capture triggers transfer creation, which needs an active payout account (docs/08) — onboard
  // one even for tests that never reach capture, so every fixture is uniformly realistic.
  await onboardMentorPayoutAccount(t.db, createFakeGateway(t.db), mentorUserId);
  return { studentId, mentorUserId };
}

async function ordersForStudent(studentId: string): Promise<number> {
  const [row] = await t.db.execute<{ count: number }>(
    sql`select count(*)::int as count from app.orders where student_id = ${studentId}`,
  );
  return row!.count;
}

describe("Phase 13: payment chaos — provider timeouts and delayed webhooks", () => {
  it("a provider outage during checkout rolls back the whole attempt — no orphan order", async () => {
    const { studentId, mentorUserId } = await seedStudentAndMentor("outage");

    await expect(
      t.db.transaction(async (tx) => {
        const chaosGateway = createFakeGateway(tx, { failOnce: { createOrder: true } });
        return createCheckout(tx, chaosGateway, {
          studentId,
          bookingId: randomUUID(),
          mentorUserId,
          serviceKind: "one_on_one",
          categoryId: null,
          baseMinor: 150000,
          currency: "INR",
          holdTtlMin: 15,
          now: new Date(),
        });
      }),
    ).rejects.toThrow(/injected chaos failure for createOrder/);

    expect(await ordersForStudent(studentId)).toBe(0);
  });

  it("a slow provider still completes checkout, just later — no partial state on success", async () => {
    const { studentId, mentorUserId } = await seedStudentAndMentor("slow");
    const started = Date.now();

    const result = await t.db.transaction(async (tx) => {
      const chaosGateway = createFakeGateway(tx, { delayMs: 50 });
      return createCheckout(tx, chaosGateway, {
        studentId,
        bookingId: randomUUID(),
        mentorUserId,
        serviceKind: "one_on_one",
        categoryId: null,
        baseMinor: 150000,
        currency: "INR",
        holdTtlMin: 15,
        now: new Date(),
      });
    });

    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
    expect(result.paymentIntent.status).toBe("pending");
    expect(await ordersForStudent(studentId)).toBe(1);
  });

  it("a webhook that never arrives is still recovered by the next sweep", async () => {
    const { studentId, mentorUserId } = await seedStudentAndMentor("missed-webhook");
    const now = new Date();
    const holdTtlMin = 15;

    const { paymentIntent, checkout } = await t.db.transaction(async (tx) => {
      const gateway = createFakeGateway(tx);
      return createCheckout(tx, gateway, {
        studentId,
        bookingId: randomUUID(),
        mentorUserId,
        serviceKind: "one_on_one",
        categoryId: null,
        baseMinor: 150000,
        currency: "INR",
        holdTtlMin,
        now,
      });
    });

    // The provider captured the payment (e.g. the browser closed before the webhook was delivered),
    // but — unlike every other payments test — we deliberately never dispatch the webhook. The sweep
    // is the only recovery path being exercised here.
    await simulateFakeCheckout(t.db, checkout.providerOrderId, "succeed", now);

    const afterHoldExpiry = new Date(now.getTime() + (holdTtlMin + 1) * 60_000);
    const swept = await sweepExpiredPaymentIntents(t.db, afterHoldExpiry);
    expect(swept.captured).toBe(1);
    expect(swept.failed).toBe(0);

    const [row] = await t.db.execute<{ status: string }>(
      sql`select status from app.payment_intents where id = ${paymentIntent.id}`,
    );
    expect(row!.status).toBe("succeeded");
  });

  it("one intent's provider timeout during a sweep doesn't block the rest of the batch", async () => {
    const a = await seedStudentAndMentor("sweep-a");
    const b = await seedStudentAndMentor("sweep-b");
    const now = new Date();
    const holdTtlMin = 15;

    for (const student of [a, b]) {
      await t.db.transaction(async (tx) => {
        const gateway = createFakeGateway(tx);
        const { checkout } = await createCheckout(tx, gateway, {
          studentId: student.studentId,
          bookingId: randomUUID(),
          mentorUserId: student.mentorUserId,
          serviceKind: "one_on_one",
          categoryId: null,
          baseMinor: 150000,
          currency: "INR",
          holdTtlMin,
          now,
        });
        await simulateFakeCheckout(tx, checkout.providerOrderId, "succeed", now);
      });
    }

    const afterHoldExpiry = new Date(now.getTime() + (holdTtlMin + 1) * 60_000);
    // Exactly one of the two `fetchPaymentStatus` calls this tick fails — which one depends on row
    // order, which is untested here on purpose; what matters is that a single failure never blocks
    // the other intent in the same batch.
    const firstSweep = await sweepExpiredPaymentIntents(t.db, afterHoldExpiry, {
      failOnce: { fetchPaymentStatus: true },
    });
    expect(firstSweep.checked).toBe(2);
    expect(firstSweep.captured).toBe(1);
    expect(firstSweep.failed).toBe(1);

    // The failed intent is untouched (still `pending`), not lost — the next scheduled tick recovers
    // it naturally since `listExpiredPendingIntents` re-selects every still-pending intent.
    const secondSweep = await sweepExpiredPaymentIntents(t.db, afterHoldExpiry);
    expect(secondSweep.checked).toBe(1);
    expect(secondSweep.captured).toBe(1);
    expect(secondSweep.failed).toBe(0);
  });
});

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import type { BrowserContext } from "@playwright/test";
import { getEnv, type Env } from "@/config/env";
import { DEMO_ACCOUNT_PASSWORD, DEMO_EMAIL_DOMAIN } from "../../../scripts/db/demo/data";

function loadedEnv(): Env {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  return getEnv();
}

const AUTH_HEADERS = (baseURL: string) => ({ origin: baseURL, "sec-fetch-site": "same-origin" });

export type StudentFixture = { email: string; password: string; displayName: string };

/**
 * Every e2e test signs up and in from the same IP, so the real per-IP limits on those routes (10
 * sign-ups/hour, 20 sign-ins/15 min) would start refusing fixtures part-way through a run. Tests
 * clear just those two buckets — the limits themselves are covered by integration tests.
 */
export async function resetAuthRateLimits(): Promise<void> {
  const env = loadedEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`
      delete from app.rate_limit_buckets
      where key like 'POST /api/v1/auth/sign-up:%' or key like 'POST /api/v1/auth/sign-in:%'
    `;
  } finally {
    await sql.end();
  }
}

/**
 * A fresh student created through the real sign-up API, with the email marked verified by direct
 * SQL (the verification link itself is covered by integration tests; e2e can't open an inbox).
 * Pass `signIn: true` to also sign the browser context in through the real sign-in API.
 */
export async function createStudent(
  context: BrowserContext,
  baseURL: string,
  tag: string,
  { signIn = false, displayName = "Riya Kapoor" }: { signIn?: boolean; displayName?: string } = {},
): Promise<StudentFixture> {
  await resetAuthRateLimits();
  const env = loadedEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const email = `e2e.student.${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
    const password = "velvet lantern orbit meadow";
    const signUpRes = await context.request.post(`${baseURL}/api/v1/auth/sign-up`, {
      data: {
        email,
        password,
        displayName,
        birthYear: 2001,
        termsVersion: "2026-09-25",
        privacyVersion: "2026-09-25",
      },
      headers: AUTH_HEADERS(baseURL),
    });
    if (!signUpRes.ok()) {
      throw new Error(`fixture sign-up failed: ${signUpRes.status()} ${await signUpRes.text()}`);
    }
    await sql`update app.users set email_verified = true, timezone = 'Asia/Kolkata' where email = ${email}`;
    if (signIn) {
      const signInRes = await context.request.post(`${baseURL}/api/v1/auth/sign-in`, {
        data: { email, password },
        headers: AUTH_HEADERS(baseURL),
      });
      if (!signInRes.ok()) {
        throw new Error(`fixture sign-in failed: ${signInRes.status()} ${await signInRes.text()}`);
      }
    }
    return { email, password, displayName };
  } finally {
    await sql.end();
  }
}

/**
 * The newest auth email queued for `email`, read from the outbox (docs/13 §7 E1 "verify email
 * (captured)") — e2e runs with no job runner, so queued emails stay put, and the link inside is
 * exactly what a real inbox would receive.
 */
export async function capturedEmailLink(email: string, path: string): Promise<string> {
  const env = loadedEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ text: string }[]>`
      select payload->>'text' as text from app.outbox_jobs
      where type = 'auth.send_email' and payload->>'to' = ${email}
      order by created_at desc limit 1
    `;
    const match = new RegExp(`${path.replace("/", "\\/")}\\?token=([\\w%-]+)`).exec(
      rows[0]?.text ?? "",
    );
    if (!match) throw new Error(`no ${path} link captured for ${email}`);
    // Captured, so never delivered: the address may sit on a real institution's domain.
    await sql`delete from app.outbox_jobs where type = 'auth.send_email' and payload->>'to' = ${email}`;
    return `${path}?token=${match[1]}`;
  } finally {
    await sql.end();
  }
}

/** The fake provider's order id behind a booking — what a real provider's own UI would hold. */
export async function providerOrderIdForBooking(bookingId: string): Promise<string> {
  const env = loadedEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ provider_order_id: string }[]>`
      select i.provider_order_id from app.payment_intents i
      join app.order_items oi on oi.order_id = i.order_id
      where oi.booking_id = ${bookingId}
    `;
    if (!rows[0]) throw new Error(`no payment intent for booking ${bookingId}`);
    return rows[0].provider_order_id;
  } finally {
    await sql.end();
  }
}

/**
 * Signs `context` in as one of the seeded demo accounts (`npm run db:seed:demo`, run by CI before
 * the suite) — for journeys that need an approved mentor who may host events, which a fresh
 * fixture can't become without the whole E6 onboarding.
 */
export async function signInDemoAccount(
  context: BrowserContext,
  baseURL: string,
  key: string,
): Promise<void> {
  await resetAuthRateLimits();
  const email = `${key}@${DEMO_EMAIL_DOMAIN}`;
  // Demo accounts are shared across tests and runs, so their per-account sign-in throttle (real,
  // and covered by integration tests) is cleared too.
  const sql = postgres(loadedEnv().DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`
      delete from app.rate_limit_buckets
      where key = ${`auth.sign_in:account:${createHash("sha256").update(email).digest("hex")}`}
    `;
  } finally {
    await sql.end();
  }
  const res = await context.request.post(`${baseURL}/api/v1/auth/sign-in`, {
    data: { email, password: DEMO_ACCOUNT_PASSWORD },
    headers: AUTH_HEADERS(baseURL),
  });
  if (!res.ok()) throw new Error(`demo sign-in failed: ${res.status()} ${await res.text()}`);
}

/** A fixture's user id, for building report targets the way the product's own pages do. */
export async function userIdForEmail(email: string): Promise<string> {
  const env = loadedEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ id: string }[]>`select id from app.users where email = ${email}`;
    if (!rows[0]) throw new Error(`no user ${email}`);
    return rows[0].id;
  } finally {
    await sql.end();
  }
}

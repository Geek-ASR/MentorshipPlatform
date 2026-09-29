/**
 * Captures what the browser reads from the API, as the preview persona, into JSON files the static
 * GitHub Pages preview serves in place of a server (docs/19 Phase 15e; `src/ui/preview-api.ts`).
 * Every response comes from the real route handlers against the seeded demo database, so shapes
 * and data match the running app exactly.
 *
 *   npx tsx scripts/preview/snapshot.ts <outDir> <student|mentor>
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { loadLocalEnv } from "../lib/load-env";

loadLocalEnv();

const [outDir, persona = "student"] = process.argv.slice(2);
if (!outDir) {
  console.error("usage: snapshot.ts <outDir> <student|mentor>");
  process.exit(1);
}

const { getEnv } = await import("../../src/config/env");
const { getDb, closeDatabase } = await import("../../src/server/platform/db/client");
const { DEMO_ACCOUNT_PASSWORD } = await import("../db/demo/data");
const { PREVIEW_ACCOUNTS } = await import("../../src/config/preview");

const env = getEnv();
// Browsers send a bare origin; APP_BASE_URL may carry a path (the Pages site lives under one).
const origin = new URL(env.APP_BASE_URL).origin;
const db = await getDb();
const email = `${PREVIEW_ACCOUNTS[persona === "mentor" ? "mentor" : "student"].key}@example.com`;
type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

function write(file: string, body: unknown): void {
  const target = path.join(outDir!, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(body));
}

let cookie = "";
async function call(
  handler: Handler,
  urlPath: string,
  params: Record<string, string> = {},
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const response = await handler(
    new Request(`${env.APP_BASE_URL}${urlPath}`, {
      method: init.method ?? "GET",
      headers: {
        origin,
        "sec-fetch-site": "same-origin",
        ...(cookie ? { cookie } : {}),
        ...(init.body !== undefined
          ? { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    }),
    { params: Promise.resolve(params) },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    ...(response.headers.get("set-cookie")
      ? { setCookie: response.headers.get("set-cookie") }
      : {}),
  } as { status: number; body: unknown };
}

async function snapshot(file: string, handler: Handler, urlPath: string, params = {}) {
  const result = await call(handler, urlPath, params);
  if (result.status >= 400)
    throw new Error(`${urlPath} → ${result.status} ${JSON.stringify(result.body)}`);
  write(file, result.body);
}

// Sign in as the persona through the real route (clearing its throttle: this database is disposable).
await db.execute(
  sql`delete from app.rate_limit_buckets where key = ${`auth.sign_in:account:${createHash("sha256").update(email).digest("hex")}`}`,
);
const signIn = (await import("../../src/app/api/v1/auth/sign-in/route")).POST as Handler;
const signInResponse = await signIn(
  new Request(`${env.APP_BASE_URL}/api/v1/auth/sign-in`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: DEMO_ACCOUNT_PASSWORD }),
  }),
  { params: Promise.resolve({}) },
);
if (!signInResponse.ok) throw new Error(`sign-in failed: ${signInResponse.status}`);
cookie = signInResponse.headers.get("set-cookie")!.split(";")[0]!;

const route = async (modulePath: string, method = "GET") =>
  (await import(`../../src/app/api/v1/${modulePath}/route`))[method] as Handler;

await snapshot("auth/viewer.json", await route("auth/viewer"), "/api/v1/auth/viewer");
await snapshot("auth/sessions.json", await route("auth/sessions"), "/api/v1/auth/sessions");
await snapshot("me/bookings.json", await route("me/bookings"), "/api/v1/me/bookings");
await snapshot(
  "me/bookings--mentor.json",
  await route("me/bookings"),
  "/api/v1/me/bookings?role=mentor",
);
await snapshot("me/waitlist.json", await route("me/waitlist"), "/api/v1/me/waitlist");
await snapshot(
  "me/saved-mentors.json",
  await route("me/saved-mentors"),
  "/api/v1/me/saved-mentors",
);

// Refund previews for the persona's upcoming bookings.
const quote = await route("bookings/[id]/cancellation-quote");
const upcoming = (await db.execute(sql`
  select b.id::text as id from app.bookings b
  join app.sessions s on s.id = b.session_id
  join app.users u on u.email = ${email}
  where (b.student_id = u.id or s.host_user_id = u.id)
    and b.status in ('confirmed', 'held') and lower(s.during) > now()
`)) as unknown as { id: string }[];
for (const { id } of upcoming) {
  await snapshot(
    `bookings/${id}/cancellation-quote.json`,
    quote,
    `/api/v1/bookings/${id}/cancellation-quote`,
    { id },
  );
}

// Live seat counts for every group session and public event.
const seats = await route("sessions/[id]/seats");
const seatSessions = (await db.execute(sql`
  select s.id::text as id from app.sessions s
  left join app.event_details e on e.session_id = s.id
  where s.kind = 'group' or (s.kind = 'event' and e.visibility <> 'private')
`)) as unknown as { id: string }[];
for (const { id } of seatSessions) {
  await snapshot(`sessions/${id}/seats.json`, seats, `/api/v1/sessions/${id}/seats`, { id });
}

// Open times for every listed mentor's session types, a month ahead (the picker filters by day).
const slots = await route("mentors/[slug]/slots");
const offers = (await db.execute(sql`
  select mp.slug, s.id::text as service_id, p.duration_min
  from app.mentor_profiles mp
  join app.mentor_services s on s.mentor_user_id = mp.user_id and s.kind = 'one_on_one' and s.is_active
  join app.service_prices p on p.service_id = s.id
  where mp.is_listed
`)) as unknown as { slug: string; service_id: string; duration_min: number }[];
const from = new Date();
const to = new Date(from.getTime() + 31 * 86_400_000 - 60_000);
for (const offer of offers) {
  const query = new URLSearchParams({
    serviceId: offer.service_id,
    durationMin: String(offer.duration_min),
    from: from.toISOString(),
    to: to.toISOString(),
  });
  await snapshot(
    `slots/${offer.slug}--${offer.service_id}--${offer.duration_min}.json`,
    slots,
    `/api/v1/mentors/${offer.slug}/slots?${query}`,
    { slug: offer.slug },
  );
}

// The platform fee for group seats, so the price preview can be computed offline.
const pricing = await call(
  await route("me/mentor/group-sessions/preview-pricing", "POST"),
  "/api/v1/me/mentor/group-sessions/preview-pricing",
  {},
  { method: "POST", body: { targetTotalMinor: 1_000_000, capacity: 10, minParticipants: 2 } },
);
const priced = pricing.body as { seatPriceMinor?: number; commissionMinor?: number };
write("pricing.json", {
  commissionBps:
    pricing.status < 400 && priced.seatPriceMinor
      ? Math.round(((priced.commissionMinor ?? 0) / priced.seatPriceMinor) * 10_000)
      : 1_000,
});

console.log(
  `Preview snapshots for ${email}: ${upcoming.length} refund previews, ${seatSessions.length} seat counts, ${offers.length} slot lists.`,
);
await closeDatabase(db);

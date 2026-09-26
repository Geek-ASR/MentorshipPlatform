import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import type { BrowserContext } from "@playwright/test";
import { getEnv, type Env } from "@/config/env";

function loadedEnv(): Env {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  return getEnv();
}

async function withSql<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(loadedEnv().DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Books a demo mentor's free session type for the signed-in `context`, through the real slots and
 * booking APIs. `pick` chooses among the open slots so parallel projects take different ones.
 */
export async function bookFreeDemoSession(
  context: BrowserContext,
  baseURL: string,
  mentorKey: string,
  pick: number,
): Promise<{ bookingId: string; mentorName: string }> {
  const mentor = await withSql(async (sql) => {
    const rows = await sql<
      {
        user_id: string;
        display_name: string;
        slug: string;
        service_id: string;
        duration_min: number;
      }[]
    >`
      select u.id as user_id, u.display_name, mp.slug, s.id as service_id, p.duration_min
      from app.users u
      join app.mentor_profiles mp on mp.user_id = u.id
      join app.mentor_services s on s.mentor_user_id = u.id and s.kind = 'one_on_one' and s.is_active
      join app.service_prices p on p.service_id = s.id and p.price_minor = 0
      where u.email = ${`${mentorKey}@example.com`}
      limit 1
    `;
    if (!rows[0]) throw new Error(`${mentorKey} has no free session type`);
    return rows[0];
  });
  const from = new Date(Date.now() + 2 * 86_400_000);
  const to = new Date(from.getTime() + 14 * 86_400_000);
  const slotsRes = await context.request.get(
    `${baseURL}/api/v1/mentors/${mentor.slug}/slots?serviceId=${mentor.service_id}&durationMin=${mentor.duration_min}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
  );
  const { slots } = (await slotsRes.json()) as { slots: { startsAt: string }[] };
  if (slots.length === 0) throw new Error(`no open slots for ${mentorKey}`);
  const slot = slots[(slots.length - 1 - pick + slots.length * 4) % slots.length]!;
  const res = await context.request.post(`${baseURL}/api/v1/bookings`, {
    data: {
      mentorUserId: mentor.user_id,
      serviceId: mentor.service_id,
      durationMin: mentor.duration_min,
      startsAt: slot.startsAt,
      intakeAnswers: [],
    },
    headers: { origin: baseURL, "sec-fetch-site": "same-origin", "idempotency-key": randomUUID() },
  });
  if (!res.ok()) throw new Error(`booking failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { booking: { id: string } };
  return { bookingId: body.booking.id, mentorName: mentor.display_name };
}

/**
 * Moves a booking's session so it started `startedMinAgo` minutes ago — e2e can't wait for real
 * time to pass. Only the session's own window moves; the attendance and refund rules that run on
 * the clock are covered by integration tests.
 */
export async function moveSessionIntoPast(
  bookingId: string,
  startedMinAgo: number,
  durationMin: number,
): Promise<void> {
  await withSql(async (sql) => {
    await sql`
      update app.sessions
      set during = tstzrange(
        now() - make_interval(mins => ${startedMinAgo}),
        now() - make_interval(mins => ${startedMinAgo - durationMin})
      )
      where id = (select session_id from app.bookings where id = ${bookingId})
    `;
    // Its calendar block still covers the original future time; release it so repeated runs
    // don't use up the demo mentor's open slots.
    await sql`
      update app.calendar_blocks set active = false, released_at = now()
      where source_type = 'session'
        and source_id = (select session_id from app.bookings where id = ${bookingId})
    `;
  });
}

/** Stands in for the attendance job settling a session both sides said went ahead. */
export async function markCompleted(bookingId: string): Promise<void> {
  await withSql(async (sql) => {
    await sql`update app.bookings set status = 'completed' where id = ${bookingId}`;
  });
}

/**
 * Cancels events a failed earlier run of the same project left on a demo host's calendar, so this
 * run's event can't clash with them. Only titles with the suite's project prefix are touched.
 */
export async function clearLeftoverE2eEvents(hostKey: string, titlePrefix: string): Promise<void> {
  await withSql(async (sql) => {
    const leftovers = await sql<{ id: string }[]>`
      select s.id from app.sessions s
      join app.event_details e on e.session_id = s.id
      join app.users u on u.id = s.host_user_id
      where u.email = ${`${hostKey}@example.com`} and starts_with(e.title, ${titlePrefix})
        and s.status = 'scheduled'
    `;
    const ids = leftovers.map((row) => row.id);
    if (ids.length === 0) return;
    await sql`
      update app.calendar_blocks set active = false, released_at = now()
      where source_type = 'session' and source_id = any(${ids}::uuid[])
    `;
    await sql`update app.sessions set status = 'cancelled' where id = any(${ids}::uuid[])`;
  });
}

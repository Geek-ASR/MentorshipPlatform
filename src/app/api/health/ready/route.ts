import { sql } from "drizzle-orm";
import journal from "../../../../../drizzle/meta/_journal.json";
import { verifyBearer } from "@/server/platform/crypto";
import { AppError } from "@/server/platform/errors";
import { defineRoute } from "@/server/platform/http/route";

const EXPECTED_MIGRATIONS = journal.entries.length;

/** Readiness for deploy verification and uptime checks (secret-protected; details are internal). */
export const GET = defineRoute(
  { name: "GET /api/health/ready", actor: "none", csrf: "none" },
  async ({ request, env, getDb }) => {
    if (!verifyBearer(request.headers.get("authorization"), env.OPS_SECRET)) {
      throw new AppError("NOT_FOUND");
    }
    const db = await getDb();
    const startedAt = performance.now();
    const [migrations] = await db.execute<{ applied: number }>(
      sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
    );
    const [outbox] = await db.execute<{ oldest_due_seconds: number | null; failed: number }>(sql`
    select
      extract(epoch from (now() - min(run_at) filter (where status = 'pending' and run_at <= now())))::int as oldest_due_seconds,
      count(*) filter (where status = 'failed')::int as failed
    from app.outbox_jobs
  `);
    const checks = {
      database: { ok: true, latencyMs: Math.round(performance.now() - startedAt) },
      migrations: {
        ok: migrations?.applied === EXPECTED_MIGRATIONS,
        applied: migrations?.applied,
        expected: EXPECTED_MIGRATIONS,
      },
      outbox: {
        ok: (outbox?.oldest_due_seconds ?? 0) < 600,
        oldestDueSeconds: outbox?.oldest_due_seconds ?? 0,
        failedJobs: outbox?.failed ?? 0,
      },
    };
    const ok = Object.values(checks).every((check) => check.ok);
    return { status: ok ? 200 : 503, body: { status: ok ? "ready" : "degraded", checks } };
  },
);

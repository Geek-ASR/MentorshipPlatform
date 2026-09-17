import { verifyBearer } from "@/server/platform/crypto";
import { AppError } from "@/server/platform/errors";
import { defineRoute } from "@/server/platform/http/route";
import { runJobTick } from "@/server/jobs";

export const maxDuration = 30;

/** Scheduler entry point (pg_cron + pg_net or GitHub Actions). Idempotent; safe to call concurrently. */
export const POST = defineRoute(
  { name: "POST /api/internal/jobs/tick", actor: "none", csrf: "none" },
  async ({ request, env, getDb, clock, logger }) => {
    if (!verifyBearer(request.headers.get("authorization"), env.JOB_TICK_SECRET)) {
      throw new AppError("NOT_FOUND");
    }
    const result = await runJobTick(await getDb(), { clock, logger, budgetMs: 20_000 });
    return { body: result };
  },
);

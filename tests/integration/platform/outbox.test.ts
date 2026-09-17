import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { manualClock } from "@/server/platform/clock";
import { outboxJobs } from "@/server/platform/db/tables/platform";
import {
  createJobRegistry,
  defineJob,
  enqueueJob,
  processDueJobs,
  scheduleRecurringJobs,
} from "@/server/platform/outbox/outbox";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { silentLogger } from "@tests/helpers/logger";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.dispose());
beforeEach(async () => {
  await t.db.execute(sql`delete from app.outbox_jobs`);
});

const calls: string[] = [];
const recordJob = defineJob({
  type: "test.record",
  schema: z.object({ label: z.string() }),
  async handle(payload) {
    calls.push(payload.label);
  },
});
let failuresLeft = 0;
const flakyJob = defineJob({
  type: "test.flaky",
  schema: z.object({}),
  maxAttempts: 3,
  async handle() {
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      throw new Error("temporary failure");
    }
  },
});
const registry = createJobRegistry([recordJob, flakyJob]);
const noJitter = () => 0.5;

describe("transactional outbox", () => {
  it("does not enqueue jobs from rolled-back transactions", async () => {
    await t.db
      .transaction(async (tx) => {
        await enqueueJob(tx, recordJob, { label: "ghost" });
        tx.rollback();
      })
      .catch(() => undefined);
    const rows = await t.db.select().from(outboxJobs);
    expect(rows).toHaveLength(0);
  });

  it("rejects invalid payloads at enqueue time", async () => {
    await expect(
      enqueueJob(t.db, recordJob, { label: 42 } as unknown as { label: string }),
    ).rejects.toThrow();
  });

  it("deduplicates by dedupe key", async () => {
    const first = await enqueueJob(t.db, recordJob, { label: "a" }, { dedupeKey: "same" });
    const second = await enqueueJob(t.db, recordJob, { label: "b" }, { dedupeKey: "same" });
    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
    expect(await t.db.select().from(outboxJobs)).toHaveLength(1);
  });

  it("processes due jobs and leaves future jobs pending", async () => {
    calls.length = 0;
    const clock = manualClock("2026-09-17T10:00:00Z");
    await enqueueJob(
      t.db,
      recordJob,
      { label: "now" },
      { runAt: new Date("2026-09-17T09:59:00Z") },
    );
    await enqueueJob(
      t.db,
      recordJob,
      { label: "later" },
      { runAt: new Date("2026-09-17T11:00:00Z") },
    );
    const result = await processDueJobs(t.db, registry, {
      workerId: "w1",
      clock,
      logger: silentLogger,
    });
    expect(result).toMatchObject({ claimed: 1, completed: 1 });
    expect(calls).toEqual(["now"]);
    const pending = await t.db.select().from(outboxJobs).where(eq(outboxJobs.status, "pending"));
    expect(pending).toHaveLength(1);
  });

  it("retries with backoff and fails permanently after max attempts", async () => {
    failuresLeft = 10;
    const clock = manualClock("2026-09-17T10:00:00Z");
    const { id } = await enqueueJob(
      t.db,
      flakyJob,
      {},
      { runAt: new Date("2026-09-17T09:00:00Z") },
    );

    const first = await processDueJobs(t.db, registry, {
      workerId: "w1",
      clock,
      logger: silentLogger,
      random: noJitter,
    });
    expect(first.retried).toBe(1);
    let [job] = await t.db.select().from(outboxJobs).where(eq(outboxJobs.id, id));
    expect(job).toMatchObject({ status: "pending", attempts: 1 });
    expect(job!.runAt.toISOString()).toBe("2026-09-17T10:01:00.000Z");
    expect(job!.lastError).toContain("temporary failure");

    // Not due yet: nothing claimed.
    expect(
      (await processDueJobs(t.db, registry, { workerId: "w1", clock, logger: silentLogger }))
        .claimed,
    ).toBe(0);

    clock.advance(60_000);
    await processDueJobs(t.db, registry, {
      workerId: "w1",
      clock,
      logger: silentLogger,
      random: noJitter,
    });
    clock.advance(5 * 60_000);
    const last = await processDueJobs(t.db, registry, {
      workerId: "w1",
      clock,
      logger: silentLogger,
      random: noJitter,
    });
    expect(last.failed).toBe(1);
    [job] = await t.db.select().from(outboxJobs).where(eq(outboxJobs.id, id));
    expect(job).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("retries jobs with unknown types instead of dropping them", async () => {
    await t.db.execute(
      sql`insert into app.outbox_jobs (id, type, payload, run_at) values (gen_random_uuid(), 'future.job_type', '{}', now() - interval '1 minute')`,
    );
    const result = await processDueJobs(t.db, registry, { workerId: "w1", logger: silentLogger });
    expect(result.retried).toBe(1);
  });

  it("reclaims jobs whose lock expired (crashed worker)", async () => {
    calls.length = 0;
    await t.db.execute(sql`
      insert into app.outbox_jobs (id, type, payload, status, attempts, locked_by, locked_until, run_at)
      values (gen_random_uuid(), 'test.record', '{"label":"orphan"}', 'processing', 1, 'dead-worker', now() - interval '1 minute', now() - interval '5 minutes')`);
    const result = await processDueJobs(t.db, registry, { workerId: "w2", logger: silentLogger });
    expect(result.completed).toBe(1);
    expect(calls).toEqual(["orphan"]);
  });

  it("processes each job exactly once with concurrent workers", async () => {
    calls.length = 0;
    const labels = Array.from({ length: 100 }, (_, index) => `job-${index}`);
    for (const label of labels) {
      await enqueueJob(t.db, recordJob, { label }, { runAt: new Date(Date.now() - 1000) });
    }
    const results = await Promise.all(
      ["w1", "w2", "w3"].map((workerId) =>
        processDueJobs(t.db, registry, { workerId, batchSize: 7, logger: silentLogger }),
      ),
    );
    expect(results.reduce((sum, result) => sum + result.completed, 0)).toBe(100);
    expect(calls).toHaveLength(100);
    expect(new Set(calls).size).toBe(100);
  });

  it("schedules recurring jobs once per interval slot", async () => {
    const recurring = [
      { definition: recordJob, intervalSeconds: 3600, payload: { label: "hourly" } },
    ];
    const now = new Date("2026-09-17T10:15:00Z");
    expect(await scheduleRecurringJobs(t.db, recurring, now)).toBe(1);
    expect(await scheduleRecurringJobs(t.db, recurring, new Date("2026-09-17T10:59:59Z"))).toBe(0);
    expect(await scheduleRecurringJobs(t.db, recurring, new Date("2026-09-17T11:00:00Z"))).toBe(1);
    const rows = await t.db.select().from(outboxJobs);
    expect(rows.map((row) => row.runAt.toISOString()).sort()).toEqual([
      "2026-09-17T10:00:00.000Z",
      "2026-09-17T11:00:00.000Z",
    ]);
  });
});

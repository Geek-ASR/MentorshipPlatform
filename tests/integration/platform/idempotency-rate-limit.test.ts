import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  abandonIdempotentRequest,
  beginIdempotentRequest,
  completeIdempotentRequest,
} from "@/server/platform/idempotency";
import { consumeRateLimit } from "@/server/platform/rate-limit";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.dispose());

const scope = (key: string) => ({ actorKey: "user-1", route: "POST /api/v1/things", key });
const now = new Date("2026-09-17T10:00:00Z");

describe("idempotency keys", () => {
  it("replays the stored response for the same key and payload", async () => {
    const s = scope("key-replay-000000001");
    expect(await beginIdempotentRequest(t.db, s, "hash-a", { now })).toEqual({ kind: "new" });
    await completeIdempotentRequest(t.db, s, { status: 201, body: { id: "abc" } });
    expect(await beginIdempotentRequest(t.db, s, "hash-a", { now })).toEqual({
      kind: "replay",
      status: 201,
      body: { id: "abc" },
    });
  });

  it("detects reuse of a key with a different payload", async () => {
    const s = scope("key-mismatch-0000001");
    await beginIdempotentRequest(t.db, s, "hash-a", { now });
    expect(await beginIdempotentRequest(t.db, s, "hash-b", { now })).toEqual({ kind: "mismatch" });
  });

  it("reports in-progress requests and lets a crashed request be taken over", async () => {
    const s = scope("key-inprogress-00001");
    await beginIdempotentRequest(t.db, s, "hash-a", { now });
    expect(
      await beginIdempotentRequest(t.db, s, "hash-a", { now: new Date(now.getTime() + 5_000) }),
    ).toEqual({
      kind: "in_progress",
    });
    expect(
      await beginIdempotentRequest(t.db, s, "hash-a", { now: new Date(now.getTime() + 120_000) }),
    ).toEqual({
      kind: "new",
    });
  });

  it("allows a key to be reused after expiry or after the request was abandoned", async () => {
    const expired = scope("key-expired-0000001");
    await beginIdempotentRequest(t.db, expired, "hash-a", { now, ttlSeconds: 60 });
    await completeIdempotentRequest(t.db, expired, { status: 200, body: {} });
    expect(
      await beginIdempotentRequest(t.db, expired, "hash-b", {
        now: new Date(now.getTime() + 61_000),
      }),
    ).toEqual({
      kind: "new",
    });

    const abandoned = scope("key-abandoned-000001");
    await beginIdempotentRequest(t.db, abandoned, "hash-a", { now });
    await abandonIdempotentRequest(t.db, abandoned);
    expect(await beginIdempotentRequest(t.db, abandoned, "hash-a", { now })).toEqual({
      kind: "new",
    });
  });

  it("admits exactly one of many concurrent first requests", async () => {
    const s = scope("key-concurrent-00001");
    const results = await Promise.all(
      Array.from({ length: 15 }, () => beginIdempotentRequest(t.db, s, "hash-a", { now })),
    );
    expect(results.filter((result) => result.kind === "new")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "in_progress")).toHaveLength(14);
  });

  it("rejects malformed keys", async () => {
    await expect(beginIdempotentRequest(t.db, scope("short"), "h", { now })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("rate limiting", () => {
  it("allows exactly the limit under concurrency", async () => {
    const rule = { key: "test.concurrent:ip:203.0.113.9", limit: 10, windowSeconds: 60 };
    const results = await Promise.all(
      Array.from({ length: 50 }, () => consumeRateLimit(t.db, rule, now)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(
      results.every((result) => result.resetAt.toISOString() === "2026-09-17T10:01:00.000Z"),
    ).toBe(true);
  });

  it("starts a new window after reset", async () => {
    const rule = { key: "test.window:ip:203.0.113.10", limit: 1, windowSeconds: 60 };
    expect((await consumeRateLimit(t.db, rule, now)).allowed).toBe(true);
    expect((await consumeRateLimit(t.db, rule, new Date(now.getTime() + 30_000))).allowed).toBe(
      false,
    );
    expect((await consumeRateLimit(t.db, rule, new Date(now.getTime() + 60_000))).allowed).toBe(
      true,
    );
    const [row] = await t.db.execute<{ buckets: number }>(
      sql`select count(*)::int as buckets from app.rate_limit_buckets where key = ${rule.key}`,
    );
    expect(row?.buckets).toBe(2);
  });
});

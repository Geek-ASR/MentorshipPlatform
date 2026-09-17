import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as notFound } from "@/app/api/[...path]/route";
import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/health/ready/route";
import { POST as tick } from "@/app/api/internal/jobs/tick/route";
import { outboxJobs } from "@/server/platform/db/tables/platform";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { routeContext, useDatabaseForRoutes } from "@tests/helpers/http";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  useDatabaseForRoutes(t.db);
});
afterAll(async () => t?.dispose());

const opsSecret = process.env.OPS_SECRET!;
const tickSecret = process.env.JOB_TICK_SECRET!;

describe("system routes", () => {
  it("liveness returns ok with no-store", async () => {
    const response = await health(new Request("http://localhost:3000/api/health"), routeContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("readiness hides itself without the secret and reports checks with it", async () => {
    const hidden = await ready(
      new Request("http://localhost:3000/api/health/ready"),
      routeContext(),
    );
    expect(hidden.status).toBe(404);
    const wrong = await ready(
      new Request("http://localhost:3000/api/health/ready", {
        headers: { authorization: `Bearer ${"x".repeat(40)}` },
      }),
      routeContext(),
    );
    expect(wrong.status).toBe(404);
    const ok = await ready(
      new Request("http://localhost:3000/api/health/ready", {
        headers: { authorization: `Bearer ${opsSecret}` },
      }),
      routeContext(),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      status: "ready",
      checks: { migrations: { ok: true }, database: { ok: true } },
    });
  });

  it("job tick requires the secret, schedules recurring jobs and processes them", async () => {
    const denied = await tick(
      new Request("http://localhost:3000/api/internal/jobs/tick", { method: "POST" }),
      routeContext(),
    );
    expect(denied.status).toBe(404);

    const response = await tick(
      new Request("http://localhost:3000/api/internal/jobs/tick", {
        method: "POST",
        headers: { authorization: `Bearer ${tickSecret}` },
      }),
      routeContext(),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recurringEnqueued).toBe(1);
    expect(body.completed).toBeGreaterThanOrEqual(1);
    const purge = await t.db
      .select()
      .from(outboxJobs)
      .where(eq(outboxJobs.type, "platform.purge_expired"));
    expect(purge[0]?.status).toBe("completed");
  });

  it("unknown API paths return problem+json 404", async () => {
    const response = await notFound(
      new Request("http://localhost:3000/api/nope"),
      routeContext({ path: ["nope"] }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });
});

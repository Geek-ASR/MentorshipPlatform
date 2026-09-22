import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/server/platform/errors";
import { defineRoute } from "@/server/platform/http/route";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";

vi.mock("@/server/platform/http/actor-resolver", () => ({
  resolveActor: async (request: Request) =>
    request.headers.get("x-test-user")
      ? {
          kind: "user",
          userId: request.headers.get("x-test-user"),
          sessionId: "s1",
          roles: new Set(["student"]),
          status: "active",
          restrictions: [],
          emailVerified: true,
          mfaVerified: false,
          authenticatedAt: new Date(),
        }
      : { kind: "anonymous" },
}));

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  useDatabaseForRoutes(t.db);
});
afterAll(async () => t?.dispose());

let executions = 0;
const createThing = defineRoute(
  {
    name: "POST /api/v1/test-things",
    body: z.object({ title: z.string().min(3).max(50) }).strict(),
    rateLimit: { limit: 100, windowSeconds: 60, by: "actor" },
    idempotency: "required",
    maxBodyBytes: 256,
  },
  async ({ body }) => {
    executions += 1;
    if (body.title === "fail-client") throw new AppError("CONFLICT");
    if (body.title === "fail-server") throw new Error("database password=secret leaked?");
    return { status: 201, body: { title: body.title, execution: executions } };
  },
);

const limited = defineRoute(
  {
    name: "GET /api/v1/test-limited",
    actor: "none",
    rateLimit: { limit: 2, windowSeconds: 60, by: "ip" },
  },
  async () => ({ body: { ok: true } }),
);

const user = { "x-test-user": "0192f0c1-3b5a-7c1d-9e2f-0123456789ab" };

describe("route pipeline", () => {
  it("rejects cross-origin and origin-less mutations (CSRF)", async () => {
    const crossSite = await createThing(
      jsonRequest("/api/v1/test-things", {
        body: { title: "hello" },
        headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      }),
      routeContext(),
    );
    expect(crossSite.status).toBe(403);
    const noOrigin = new Request("http://localhost:3000/api/v1/test-things", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "hello" }),
    });
    expect((await createThing(noOrigin, routeContext())).status).toBe(403);
  });

  it("requires JSON, enforces size limits and rejects unknown fields", async () => {
    const formPost = await createThing(
      jsonRequest("/api/v1/test-things", {
        rawBody: "title=hello",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      routeContext(),
    );
    expect(formPost.status).toBe(415);

    const tooLarge = await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "x".repeat(1000) } }),
      routeContext(),
    );
    expect(tooLarge.status).toBe(413);

    const massAssignment = await createThing(
      jsonRequest("/api/v1/test-things", {
        body: { title: "hello", isAdmin: true },
        headers: { ...user, "idempotency-key": "k".repeat(20) },
      }),
      routeContext(),
    );
    expect(massAssignment.status).toBe(422);
    const problem = await massAssignment.json();
    expect(problem).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    expect(massAssignment.headers.get("content-type")).toContain("application/problem+json");
  });

  it("requires authentication and a valid idempotency key for idempotent routes", async () => {
    const anonymous = await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "hello" } }),
      routeContext(),
    );
    expect(anonymous.status).toBe(401);
    const missingKey = await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "hello" }, headers: user }),
      routeContext(),
    );
    expect(missingKey.status).toBe(422);
  });

  it("replays successful and client-error responses, rejects key reuse with a different body", async () => {
    const headers = { ...user, "idempotency-key": "idem-key-success-0001" };
    const first = await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "hello" }, headers }),
      routeContext(),
    );
    const replay = await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "hello" }, headers }),
      routeContext(),
    );
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(await replay.json()).toEqual(await first.json());

    const reused = await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "different" }, headers }),
      routeContext(),
    );
    expect(reused.status).toBe(422);
    expect((await reused.json()).code).toBe("IDEMPOTENCY_KEY_REUSED");

    const conflictHeaders = { ...user, "idempotency-key": "idem-key-conflict-001" };
    const conflict = await createThing(
      jsonRequest("/api/v1/test-things", {
        body: { title: "fail-client" },
        headers: conflictHeaders,
      }),
      routeContext(),
    );
    const conflictReplay = await createThing(
      jsonRequest("/api/v1/test-things", {
        body: { title: "fail-client" },
        headers: conflictHeaders,
      }),
      routeContext(),
    );
    expect([conflict.status, conflictReplay.status]).toEqual([409, 409]);
    expect(conflictReplay.headers.get("content-type")).toContain("application/problem+json");
  });

  it("hides internal error details and releases the idempotency key on server errors", async () => {
    const headers = { ...user, "idempotency-key": "idem-key-server-error1" };
    const before = executions;
    const failed = await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "fail-server" }, headers }),
      routeContext(),
    );
    expect(failed.status).toBe(500);
    const text = await failed.text();
    expect(text).not.toContain("password");
    expect(JSON.parse(text)).toMatchObject({ code: "INTERNAL", requestId: expect.any(String) });
    await createThing(
      jsonRequest("/api/v1/test-things", { body: { title: "fail-server" }, headers }),
      routeContext(),
    );
    expect(executions).toBe(before + 2);
  });

  it("rate limits with Retry-After", async () => {
    const request = () => new Request("http://localhost:3000/api/v1/test-limited");
    expect((await limited(request(), routeContext())).status).toBe(200);
    expect((await limited(request(), routeContext())).status).toBe(200);
    const blocked = await limited(request(), routeContext());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("propagates well-formed request ids and replaces malformed ones", async () => {
    const good = await limited(
      new Request("http://localhost:3000/x", { headers: { "x-request-id": "trace-abc-12345" } }),
      routeContext(),
    );
    expect(good.headers.get("x-request-id")).toBe("trace-abc-12345");
    const bad = await limited(
      new Request("http://localhost:3000/x", { headers: { "x-request-id": "<script>" } }),
      routeContext(),
    );
    expect(bad.headers.get("x-request-id")).not.toBe("<script>");
  });
});

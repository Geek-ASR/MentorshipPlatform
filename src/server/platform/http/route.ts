import type { Logger } from "pino";
import type { z } from "zod";
import { getEnv, type Env } from "@/config/env";
import { anonymousActor, type Actor } from "../authz/actor";
import { systemClock, type Clock } from "../clock";
import { sha256Hex } from "../crypto";
import { getDb, type Database } from "../db/client";
import { AppError, isAppError, toProblem } from "../errors";
import {
  abandonIdempotentRequest,
  assertValidIdempotencyKey,
  beginIdempotentRequest,
  completeIdempotentRequest,
  type IdempotencyScope,
} from "../idempotency";
import { getLogger } from "../logger";
import { consumeRateLimit } from "../rate-limit";
import { resolveRequestId, runWithRequestContext } from "../request-context";
import { resolveActor } from "./actor-resolver";
import { getClientIp, rateLimitKeyForIp } from "./client-ip";
import { assertSameOrigin, isSafeMethod, readJsonBody } from "./request-guards";
import { jsonResponse, NO_STORE, problemResponse } from "./responses";

export type RouteResult = {
  status?: number;
  body?: unknown;
  /** Array values append repeated headers individually (e.g. multiple `set-cookie`). */
  headers?: Record<string, string | string[]>;
  /**
   * Bypasses JSON encoding entirely — for a redirect (`GET /sessions/:id/join`) or a non-JSON body
   * (`GET /bookings/:id/calendar.ics`). When set, `status`/`body` are ignored.
   */
  raw?: Response;
};

export type RouteContext<TBody, TQuery, TParams> = {
  request: Request;
  requestId: string;
  actor: Actor;
  body: TBody;
  query: TQuery;
  params: TParams;
  clientIp: string | null;
  /** Lazily connects; routes that never touch the database (e.g. liveness) never open a connection. */
  getDb: () => Promise<Database>;
  env: Env;
  clock: Clock;
  logger: Logger;
};

export type RouteOptions<TBody, TQuery, TParams> = {
  /** Stable identifier used for logs, rate-limit and idempotency scopes, e.g. `POST /api/v1/bookings`. */
  name: string;
  body?: z.ZodType<TBody>;
  query?: z.ZodType<TQuery>;
  params?: z.ZodType<TParams>;
  /** Default 64 KB. */
  maxBodyBytes?: number;
  /** Cookie-authenticated browser routes enforce same-origin on mutations. Machine routes opt out. */
  csrf?: "same-origin" | "none";
  /** Machine routes (health, webhooks, job tick) authenticate with secrets/signatures instead. */
  actor?: "resolve" | "none";
  rateLimit?: { limit: number; windowSeconds: number; by: "ip" | "actor" };
  idempotency?: "required" | "none";
};

type NextRouteContext = { params: Promise<unknown> };

function parseWith<T>(schema: z.ZodType<T> | undefined, input: unknown, prefix: string): T {
  if (!schema) return undefined as T;
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION_FAILED", {
      errors: result.error.issues.map((issue) => ({
        path: [prefix, ...issue.path.map(String)].join("."),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  return result.data;
}

function replayResponse(status: number, body: unknown, requestId: string): Response {
  const isProblem = status >= 400;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": isProblem
        ? "application/problem+json; charset=utf-8"
        : "application/json; charset=utf-8",
      "cache-control": NO_STORE,
      "idempotent-replayed": "true",
      "x-request-id": requestId,
    },
  });
}

/**
 * Wraps a Route Handler with the platform request pipeline: request id → CSRF origin check →
 * params/query/body validation → actor resolution → rate limit → idempotency → handler → safe
 * problem+json errors. Authorization stays inside application services, never here alone.
 */
export function defineRoute<TBody = undefined, TQuery = undefined, TParams = undefined>(
  options: RouteOptions<TBody, TQuery, TParams>,
  handler: (context: RouteContext<TBody, TQuery, TParams>) => Promise<RouteResult>,
) {
  return async function routeHandler(
    request: Request,
    nextContext: NextRouteContext,
  ): Promise<Response> {
    const requestId = resolveRequestId(request.headers.get("x-request-id"));
    const instance = new URL(request.url).pathname;

    return runWithRequestContext({ requestId, route: options.name }, async () => {
      const logger = getLogger().child({ route: options.name });
      const startedAt = performance.now();
      let dbPromise: Promise<Database> | undefined;
      const lazyDb = () => (dbPromise ??= getDb());
      let idempotencyScope: IdempotencyScope | undefined;

      try {
        const env = getEnv();
        const clock = systemClock;

        if (!isSafeMethod(request.method) && (options.csrf ?? "same-origin") === "same-origin") {
          assertSameOrigin(request.headers, env.APP_BASE_URL);
        }

        const rawParams = (await nextContext?.params) ?? {};
        const params = parseWith(options.params, rawParams, "params");
        const query = parseWith(
          options.query,
          Object.fromEntries(new URL(request.url).searchParams),
          "query",
        );
        const rawBody = options.body
          ? await readJsonBody(request, options.maxBodyBytes ?? 64 * 1024)
          : undefined;
        const body = parseWith(options.body, rawBody, "body");

        const actor =
          (options.actor ?? "resolve") === "resolve"
            ? await resolveActor(request, await lazyDb(), env)
            : anonymousActor;
        const clientIp = getClientIp(request.headers, env.CLIENT_IP_HEADER);

        if (options.rateLimit) {
          const subject =
            options.rateLimit.by === "actor" && actor.kind === "user"
              ? `user:${actor.userId}`
              : rateLimitKeyForIp(clientIp);
          const result = await consumeRateLimit(
            await lazyDb(),
            {
              key: `${options.name}:${subject}`,
              limit: options.rateLimit.limit,
              windowSeconds: options.rateLimit.windowSeconds,
            },
            clock.now(),
          );
          if (!result.allowed) {
            const retryAfter = Math.max(
              1,
              Math.ceil((result.resetAt.getTime() - clock.now().getTime()) / 1000),
            );
            throw new AppError("RATE_LIMITED", {
              headers: {
                "retry-after": String(retryAfter),
                "ratelimit-limit": String(result.limit),
                "ratelimit-remaining": "0",
              },
            });
          }
        }

        if (options.idempotency === "required") {
          if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
          const key = request.headers.get("idempotency-key");
          assertValidIdempotencyKey(key);
          const scope: IdempotencyScope = { actorKey: actor.userId, route: options.name, key };
          const requestHash = sha256Hex(
            JSON.stringify({ params: rawParams, body: rawBody ?? null }),
          );
          const start = await beginIdempotentRequest(await lazyDb(), scope, requestHash, {
            now: clock.now(),
          });
          if (start.kind === "replay") return replayResponse(start.status, start.body, requestId);
          if (start.kind === "mismatch") throw new AppError("IDEMPOTENCY_KEY_REUSED");
          if (start.kind === "in_progress") throw new AppError("REQUEST_IN_PROGRESS");
          idempotencyScope = scope;
        }

        const result = await handler({
          request,
          requestId,
          actor,
          body,
          query,
          params,
          clientIp,
          getDb: lazyDb,
          env,
          clock,
          logger,
        });
        if (result.raw) {
          logger.info({
            event: "http.request",
            method: request.method,
            status: result.raw.status,
            durationMs: Math.round(performance.now() - startedAt),
          });
          return result.raw;
        }
        const status = result.status ?? 200;
        if (idempotencyScope) {
          await completeIdempotentRequest(await lazyDb(), idempotencyScope, {
            status,
            body: result.body ?? null,
          });
        }
        logger.info({
          event: "http.request",
          method: request.method,
          status,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return jsonResponse(result.body ?? null, { status, headers: result.headers, requestId });
      } catch (error) {
        if (idempotencyScope) {
          const db = await lazyDb();
          // Deterministic client errors are stored and replayed; server errors release the key for retry.
          if (isAppError(error) && error.status < 500) {
            await completeIdempotentRequest(db, idempotencyScope, {
              status: error.status,
              body: toProblem(error, { instance, requestId }),
            }).catch(() => undefined);
          } else {
            await abandonIdempotentRequest(db, idempotencyScope).catch(() => undefined);
          }
        }
        const status = isAppError(error) ? error.status : 500;
        const logPayload = {
          event: "http.request",
          method: request.method,
          status,
          code: isAppError(error) ? error.code : "INTERNAL",
          durationMs: Math.round(performance.now() - startedAt),
        };
        if (status >= 500) logger.error({ ...logPayload, err: error }, "request failed");
        else logger.info(logPayload);
        return problemResponse(error, { instance, requestId });
      }
    });
  };
}

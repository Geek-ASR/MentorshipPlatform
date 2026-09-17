import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { idempotencyKeys } from "./db/tables/platform";
import { AppError } from "./errors";

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type IdempotencyScope = {
  /** Authenticated user id (preferred) or another stable, non-guessable actor key. */
  actorKey: string;
  /** Stable route identifier, e.g. `POST /api/v1/bookings`. */
  route: string;
  key: string;
};

export type IdempotencyStart =
  | { kind: "new" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "in_progress" }
  | { kind: "mismatch" };

export type IdempotencyOptions = {
  now: Date;
  ttlSeconds?: number;
  /** An in-progress record older than this is considered abandoned (crashed request) and taken over. */
  staleAfterSeconds?: number;
};

export function assertValidIdempotencyKey(key: string | null): asserts key is string {
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AppError("VALIDATION_FAILED", {
      detail: "A valid Idempotency-Key header (16–128 URL-safe characters) is required.",
      errors: [
        {
          path: "headers.idempotency-key",
          code: "invalid",
          message: "Invalid or missing idempotency key",
        },
      ],
    });
  }
}

/** Records the start of an idempotent request or tells the caller how to respond to a repeat. */
export async function beginIdempotentRequest(
  db: Database,
  scope: IdempotencyScope,
  requestHash: string,
  options: IdempotencyOptions,
): Promise<IdempotencyStart> {
  assertValidIdempotencyKey(scope.key);
  const ttlSeconds = options.ttlSeconds ?? 24 * 3600;
  const staleAfterSeconds = options.staleAfterSeconds ?? 60;
  const expiresAt = new Date(options.now.getTime() + ttlSeconds * 1000);
  const matchScope = and(
    eq(idempotencyKeys.actorKey, scope.actorKey),
    eq(idempotencyKeys.route, scope.route),
    eq(idempotencyKeys.key, scope.key),
  );

  return db.transaction(async (tx) => {
    await tx
      .delete(idempotencyKeys)
      .where(and(matchScope, lte(idempotencyKeys.expiresAt, options.now)));

    const inserted = await tx
      .insert(idempotencyKeys)
      .values({ ...scope, requestHash, state: "in_progress", createdAt: options.now, expiresAt })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });
    if (inserted.length > 0) return { kind: "new" } as const;

    const [existing] = await tx.select().from(idempotencyKeys).where(matchScope).for("update");
    if (!existing) return { kind: "in_progress" } as const;
    if (existing.requestHash !== requestHash) return { kind: "mismatch" } as const;
    if (existing.state === "completed") {
      return {
        kind: "replay",
        status: existing.responseStatus ?? 200,
        body: existing.responseBody,
      } as const;
    }
    const staleBefore = new Date(options.now.getTime() - staleAfterSeconds * 1000);
    if (existing.createdAt <= staleBefore) {
      await tx
        .update(idempotencyKeys)
        .set({ createdAt: options.now, expiresAt })
        .where(and(matchScope, eq(idempotencyKeys.state, "in_progress")));
      return { kind: "new" } as const;
    }
    return { kind: "in_progress" } as const;
  });
}

/** Stores the final response so retries with the same key replay it. */
export async function completeIdempotentRequest(
  db: Database,
  scope: IdempotencyScope,
  response: { status: number; body: unknown },
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({
      state: "completed",
      responseStatus: response.status,
      responseBody: response.body ?? null,
    })
    .where(
      and(
        eq(idempotencyKeys.actorKey, scope.actorKey),
        eq(idempotencyKeys.route, scope.route),
        eq(idempotencyKeys.key, scope.key),
      ),
    );
}

/** Releases the key after a server-side failure so the client can safely retry. */
export async function abandonIdempotentRequest(
  db: Database,
  scope: IdempotencyScope,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM app.idempotency_keys
    WHERE actor_key = ${scope.actorKey} AND route = ${scope.route} AND key = ${scope.key} AND state = 'in_progress'
  `);
}

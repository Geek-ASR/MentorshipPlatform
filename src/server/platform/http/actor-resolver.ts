import type { Env } from "@/config/env";
import { readSessionToken, resolveSessionActor } from "@/server/modules/auth";
import { anonymousActor, type Actor } from "../authz/actor";
import { systemClock } from "../clock";
import type { Database } from "../db/client";

/**
 * Resolves the authenticated actor for a request from the session cookie (docs/07 §5). This is the
 * one deliberate place the framework-agnostic platform pipeline reaches into a specific module: every
 * request needs an identity, and the auth module owns what that identity means.
 */
export async function resolveActor(request: Request, db: Database, env: Env): Promise<Actor> {
  const token = readSessionToken(request.headers, env);
  if (!token) return anonymousActor;
  try {
    return await resolveSessionActor(db, token, systemClock.now());
  } catch {
    return anonymousActor;
  }
}

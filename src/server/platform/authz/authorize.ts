import { AppError, type ErrorCode } from "../errors";
import {
  activeRestriction,
  isStaff,
  type Actor,
  type Capability,
  type Role,
  type UserActor,
} from "./actor";

export type DenyCode = Extract<
  ErrorCode,
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ACCOUNT_RESTRICTED"
  | "REAUTH_REQUIRED"
  | "MFA_REQUIRED"
  | "EMAIL_NOT_VERIFIED"
>;

export type Decision = { allow: true } | { allow: false; code: DenyCode; reason: string };

export const allow = (): Decision => ({ allow: true });
export const deny = (code: DenyCode, reason: string): Decision => ({ allow: false, code, reason });

export type PolicyContext = { now: Date; recentAuthWindowMinutes?: number };

/** A pure authorization rule over an actor and a (pre-loaded) resource view. */
export type Policy<TResource> = (
  actor: Actor,
  resource: TResource,
  context: PolicyContext,
) => Decision;

const BLOCKED_STATUSES = new Set(["suspended", "banned", "deleted"]);

/** Fails closed: any thrown error inside a policy is treated as a denial by the caller's error path. */
export function authorize<TResource>(
  actor: Actor,
  policy: Policy<TResource>,
  resource: TResource,
  context: PolicyContext,
): void {
  const decision = policy(actor, resource, context);
  if (!decision.allow) {
    // The reason travels as `cause` for server logs only; clients see the generic title for the code.
    throw new AppError(decision.code, { cause: decision.reason });
  }
}

/* ---------------------------- composable guards (return a Decision) ---------------------------- */

export function requireUser(actor: Actor): Decision {
  if (actor.kind !== "user") return deny("UNAUTHENTICATED", "not signed in");
  if (BLOCKED_STATUSES.has(actor.status))
    return deny("ACCOUNT_RESTRICTED", `account ${actor.status}`);
  return allow();
}

export function requireVerifiedEmail(actor: UserActor): Decision {
  return actor.emailVerified ? allow() : deny("EMAIL_NOT_VERIFIED", "email not verified");
}

export function requireCapability(actor: UserActor, capability: Capability, now: Date): Decision {
  return activeRestriction(actor, capability, now)
    ? deny("ACCOUNT_RESTRICTED", `capability ${capability} restricted`)
    : allow();
}

export function requireAnyRole(actor: UserActor, roles: ReadonlyArray<Role>): Decision {
  return roles.some((role) => actor.roles.has(role))
    ? allow()
    : deny("FORBIDDEN", `requires one of ${roles.join(",")}`);
}

/** Staff actions always require MFA (docs/07 §3.6). */
export function requireStaffWithMfa(actor: UserActor, roles: ReadonlyArray<Role>): Decision {
  if (!isStaff(actor)) return deny("NOT_FOUND", "not staff");
  const roleDecision = requireAnyRole(actor, roles);
  if (!roleDecision.allow) return roleDecision;
  return actor.mfaVerified ? allow() : deny("MFA_REQUIRED", "staff without MFA");
}

export function requireRecentAuth(actor: UserActor, context: PolicyContext): Decision {
  const windowMs = (context.recentAuthWindowMinutes ?? 10) * 60_000;
  return context.now.getTime() - actor.authenticatedAt.getTime() <= windowMs
    ? allow()
    : deny("REAUTH_REQUIRED", "authentication not recent");
}

/** Runs guards in order and returns the first denial. */
export function all(...decisions: Array<() => Decision>): Decision {
  for (const evaluate of decisions) {
    const decision = evaluate();
    if (!decision.allow) return decision;
  }
  return allow();
}

/**
 * Signed in, active, and authenticated recently enough for a sensitive action (docs/07 §5 step-up).
 * Shaped as a `Policy<undefined>` so it can be passed straight to `authorize()` with no resource.
 */
export function requireRecentUserAuth(
  actor: Actor,
  _resource: unknown,
  context: PolicyContext,
): Decision {
  return all(
    () => requireUser(actor),
    () =>
      actor.kind === "user"
        ? requireRecentAuth(actor, context)
        : deny("UNAUTHENTICATED", "not signed in"),
  );
}

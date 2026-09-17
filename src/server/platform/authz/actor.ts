/**
 * Who is performing an action. Every application service receives an Actor and must authorize
 * before side effects (docs/07 §6.3). System jobs use an explicit SystemActor, never a bypass.
 */

export const ROLES = [
  "student",
  "mentor",
  "event_host",
  "content_editor",
  "verification_reviewer",
  "moderator",
  "finance",
  "admin",
  "super_admin",
] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: ReadonlySet<Role> = new Set([
  "content_editor",
  "verification_reviewer",
  "moderator",
  "finance",
  "admin",
  "super_admin",
]);

/** Capabilities that trust & safety can restrict independently of roles (docs/10 §7.3). */
export const CAPABILITIES = [
  "booking.create",
  "booking.accept",
  "message.send",
  "review.create",
  "event.host",
  "listing.visible",
  "payout.release",
  "report.create",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type UserStatus =
  "active" | "restricted" | "suspended" | "banned" | "deletion_requested" | "deleted";

export type Restriction = {
  capability: Capability;
  /** null = until lifted by staff */
  until: Date | null;
};

export type UserActor = {
  kind: "user";
  userId: string;
  roles: ReadonlySet<Role>;
  status: UserStatus;
  restrictions: ReadonlyArray<Restriction>;
  emailVerified: boolean;
  mfaVerified: boolean;
  /** Time of the last primary authentication (password/OAuth/passkey) for step-up checks. */
  authenticatedAt: Date;
};

export type SystemActor = { kind: "system"; job: string };
export type AnonymousActor = { kind: "anonymous" };
export type Actor = UserActor | SystemActor | AnonymousActor;

export const anonymousActor: AnonymousActor = { kind: "anonymous" };

export function systemActor(job: string): SystemActor {
  return { kind: "system", job };
}

export function hasRole(actor: Actor, role: Role): boolean {
  return actor.kind === "user" && actor.roles.has(role);
}

export function isStaff(actor: Actor): boolean {
  return actor.kind === "user" && [...actor.roles].some((role) => STAFF_ROLES.has(role));
}

export function activeRestriction(
  actor: UserActor,
  capability: Capability,
  now: Date,
): Restriction | undefined {
  return actor.restrictions.find(
    (restriction) =>
      restriction.capability === capability &&
      (restriction.until === null || restriction.until > now),
  );
}

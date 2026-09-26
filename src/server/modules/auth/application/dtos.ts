import type { Role, UserActor } from "@/server/platform/authz/actor";
import type { UserRow } from "../infra/user-repo";
import type { SessionSummary } from "./sessions";

/** The "who am I" shape (docs/07 §6.3): only ever the caller's own data, never another user's. */
export type MeDto = {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  /** IANA zone every time in the UI is shown in (docs/22 §1 "time clarity"). */
  timezone: string;
  status: string;
  roles: Role[];
  mfaEnabled: boolean;
};

export function toMeDto(user: UserRow, actor: UserActor, mfaEnabled: boolean): MeDto {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    timezone: user.timezone,
    status: user.status,
    roles: [...actor.roles],
    mfaEnabled,
  };
}

export type SessionSummaryDto = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipPrefix: string | null;
  isCurrent: boolean;
};

export function toSessionSummaryDto(session: SessionSummary): SessionSummaryDto {
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    ipPrefix: session.ipPrefix,
    isCurrent: session.isCurrent,
  };
}

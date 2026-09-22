import { STAFF_ROLES } from "@/server/platform/authz/actor";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import type { Executor } from "@/server/platform/db/client";
import { sessionLifetimeFor } from "../domain/session-policy";
import { createSession, type SessionRow } from "../infra/session-repo";
import { rolesForUser } from "../infra/user-repo";

export type IssueSessionParams = {
  userId: string;
  now: Date;
  mfaVerified: boolean;
  ipPrefix: string | null;
  userAgentHash: string | null;
};

/** Creates a session and returns the raw bearer token (never persisted — only its hash is). */
export async function issueSession(
  executor: Executor,
  params: IssueSessionParams,
): Promise<{ token: string; session: SessionRow }> {
  const roles = await rolesForUser(executor, params.userId);
  const isStaffUser = roles.some((role) => STAFF_ROLES.has(role));
  const { absoluteMs } = sessionLifetimeFor(isStaffUser);
  const token = randomToken(32);
  const session = await createSession(executor, {
    userId: params.userId,
    tokenHash: sha256Hex(token),
    authTime: params.now,
    mfaVerified: params.mfaVerified,
    expiresAt: new Date(params.now.getTime() + absoluteMs),
    ipPrefix: params.ipPrefix,
    userAgentHash: params.userAgentHash,
  });
  return { token, session };
}

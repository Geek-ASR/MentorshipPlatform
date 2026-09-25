/**
 * Public surface of the auth module (docs/07). Other modules and Next.js route handlers depend only
 * on this file — never on `application/*`, `domain/*` or `infra/*` directly (tests/architecture).
 */

export {
  ROLES,
  STAFF_ROLES,
  CAPABILITIES,
  type Role,
  type Capability,
} from "@/server/platform/authz/actor";

export { signUp, type SignUpInput, type SignUpResult } from "./application/sign-up";
export { verifyEmail } from "./application/verify-email";
export { signIn, type SignInInput, type SignInResult } from "./application/sign-in";
export { completeMfaSignIn, type CompleteMfaSignInResult } from "./application/mfa-sign-in";
export { signOut } from "./application/sign-out";
export { requestPasswordReset, resetPassword } from "./application/password-reset";
export { changePassword } from "./application/change-password";
export {
  requestEmailChange,
  confirmEmailChange,
  revertEmailChange,
} from "./application/email-change";
export { startMfaEnrollment, confirmMfaEnrollment, disableMfa, mfaStatus } from "./application/mfa";
export { verifyMfaStepUp } from "./application/mfa-step-up";
export { listSessions, revokeAllSessions, type SessionSummary } from "./application/sessions";
export {
  startGoogleSignIn,
  completeGoogleSignIn,
  type GoogleStartInput,
} from "./application/google-oauth";
export { resolveSessionActor } from "./application/session-actor";
export { alwaysCleanPasswordChecker, type BreachedPasswordChecker } from "./application/ports";
export { authJobs, sendAuthEmail } from "./application/jobs";
export {
  toMeDto,
  toSessionSummaryDto,
  type MeDto,
  type SessionSummaryDto,
} from "./application/dtos";

export {
  findUserById,
  findUsersByIds,
  grantRole,
  listUsersForAdmin,
  rolesForUser,
  updateUserStatus,
  type UserRow,
} from "./infra/user-repo";
export { revokeAllSessionsForUser, markSessionMfaVerified } from "./infra/session-repo";
export { createHibpChecker } from "./infra/hibp-checker";
export { users } from "./infra/tables";

export { blockUser, unblockUser, isBlocked, listMyBlocks } from "./application/blocking";
export type { UserBlockRow } from "./infra/block-repo";
export {
  insertRestriction,
  hasActiveRestriction,
  liftRestriction,
  liftAllRestrictionsFromAction,
  liftAllActiveRestrictionsForUser,
  listRestrictionRowsForUser,
  toActiveRestrictions,
  type UserRestrictionRow,
} from "./infra/restriction-repo";

export {
  sessionCookieName,
  buildSessionCookie,
  buildClearSessionCookie,
  readSessionToken,
} from "./http/cookies";
export {
  buildOAuthStateCookie,
  buildClearOAuthStateCookie,
  readOAuthStateCookie,
  type OAuthPendingState,
} from "./http/oauth-state-cookie";

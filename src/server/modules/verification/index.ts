/**
 * Public surface of the verification module (docs/10 §2). Document-upload verification is out of
 * scope this phase (needs an ObjectStore adapter, magic-byte checks and a reviewer UI) — only the
 * email-challenge method exists here.
 */

export {
  requestEmailChallenge,
  confirmEmailChallenge,
  type RequestChallengeDeps,
  type ConfirmChallengeResult,
} from "./application/email-challenge";
export { listCredentials, revokeCredentialAsStaff } from "./application/credentials";
export { countActiveCredentials, listCredentialsForAdmin } from "./infra/credential-repo";
export {
  VERIFICATION_METHODS,
  CREDENTIAL_KINDS,
  CREDENTIAL_STATUSES,
  type VerificationMethod,
  type CredentialKind,
  type CredentialStatus,
} from "./infra/tables";
export type { CredentialRow } from "./infra/credential-repo";

import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { sha256Hex } from "@/server/platform/crypto";
import { writeAudit } from "@/server/platform/audit";
import { verifyTotp } from "../domain/totp";
import { consumeBackupCode, getTwoFactorForUser, recordAcceptedCounter } from "../infra/mfa-repo";
import { markSessionMfaVerified } from "../infra/session-repo";
import { decryptTotpSecret } from "./totp-secrets";

export type VerifyMfaStepUpInput = { userId: string; sessionId: string; code: string };
export type VerifyMfaStepUpDeps = { db: Database; clock: Clock; mfaEncryptionKey: string };

/**
 * Elevates an *already-signed-in* session to `mfaVerified: true` (docs/07 §3.6 "mandatory for all
 * staff roles, enforced at every staff request") without a full re-sign-in — distinct from
 * `completeMfaSignIn`, which only ever runs against a brand-new, not-yet-issued session from a
 * pending sign-in token. This is the gap Phase 11 surfaced: a staff member whose session predates
 * their MFA enrollment (or who just finished enrolling mid-session) had no way to step *this*
 * session up short of signing out and back in — `markSessionMfaVerified` existed but nothing besides
 * `completeMfaSignIn` ever called it.
 */
export async function verifyMfaStepUp(
  input: VerifyMfaStepUpInput,
  deps: VerifyMfaStepUpDeps,
): Promise<void> {
  const now = deps.clock.now();
  const twoFactor = await getTwoFactorForUser(deps.db, input.userId);
  if (!twoFactor?.enabled) throw new AppError("BAD_REQUEST", { detail: "Enrol in MFA first." });

  let verified = false;
  if (/^\d{6}$/.test(input.code)) {
    const secret = decryptTotpSecret(twoFactor, deps.mfaEncryptionKey);
    const lastUsedCounter = twoFactor.lastUsedCounter ? BigInt(twoFactor.lastUsedCounter) : null;
    const result = verifyTotp(secret, input.code, now, lastUsedCounter);
    if (result.valid) {
      await recordAcceptedCounter(deps.db, input.userId, result.counter);
      verified = true;
    }
  } else {
    verified = await consumeBackupCode(deps.db, input.userId, sha256Hex(input.code), now);
  }
  if (!verified) throw new AppError("INVALID_CREDENTIALS", { detail: "Incorrect code." });

  await deps.db.transaction(async (tx) => {
    await markSessionMfaVerified(tx, input.sessionId, now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: input.userId,
      action: "auth.mfa_step_up",
      targetType: "user",
      targetId: input.userId,
    });
  });
}

import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { sha256Hex } from "@/server/platform/crypto";
import { writeAudit } from "@/server/platform/audit";
import { verifyTotp } from "../domain/totp";
import { consumeToken } from "../infra/token-repo";
import { consumeBackupCode, getTwoFactorForUser, recordAcceptedCounter } from "../infra/mfa-repo";
import { decryptTotpSecret } from "./totp-secrets";
import { issueSession } from "./session-issuer";

export type CompleteMfaSignInInput = { pendingToken: string; code: string };
export type CompleteMfaSignInDeps = { db: Database; clock: Clock; mfaEncryptionKey: string };
export type CompleteMfaSignInResult = { token: string; userId: string; expiresAt: Date };

export async function completeMfaSignIn(
  input: CompleteMfaSignInInput,
  deps: CompleteMfaSignInDeps,
): Promise<CompleteMfaSignInResult> {
  const now = deps.clock.now();
  const pending = await consumeToken(deps.db, "mfa_pending", sha256Hex(input.pendingToken), now);
  if (!pending) throw new AppError("BAD_REQUEST", { detail: "This sign-in attempt has expired." });

  const twoFactor = await getTwoFactorForUser(deps.db, pending.userId);
  if (!twoFactor?.enabled) throw new AppError("BAD_REQUEST");

  const metadata = pending.metadata as { ipPrefix?: string | null; userAgentHash?: string | null };
  let verified = false;

  if (/^\d{6}$/.test(input.code)) {
    const secret = decryptTotpSecret(twoFactor, deps.mfaEncryptionKey);
    const lastUsedCounter = twoFactor.lastUsedCounter ? BigInt(twoFactor.lastUsedCounter) : null;
    const result = verifyTotp(secret, input.code, now, lastUsedCounter);
    if (result.valid) {
      await recordAcceptedCounter(deps.db, pending.userId, result.counter);
      verified = true;
    }
  } else {
    verified = await consumeBackupCode(deps.db, pending.userId, sha256Hex(input.code), now);
  }

  if (!verified) throw new AppError("INVALID_CREDENTIALS", { detail: "Incorrect code." });

  const { token, session } = await deps.db.transaction(async (tx) => {
    const issued = await issueSession(tx, {
      userId: pending.userId,
      now,
      mfaVerified: true,
      ipPrefix: metadata.ipPrefix ?? null,
      userAgentHash: metadata.userAgentHash ?? null,
    });
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: pending.userId,
      action: "auth.sign_in",
      targetType: "user",
      targetId: pending.userId,
      metadata: { mfa: true },
      ipPrefix: metadata.ipPrefix ?? null,
    });
    return issued;
  });

  return { token, userId: pending.userId, expiresAt: session.expiresAt };
}

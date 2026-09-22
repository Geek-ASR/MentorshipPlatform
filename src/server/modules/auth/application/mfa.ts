import { randomBytes } from "node:crypto";
import { brand } from "@/config/brand";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { sha256Hex } from "@/server/platform/crypto";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { writeAudit } from "@/server/platform/audit";
import { generateBackupCodes } from "../domain/backup-codes";
import { totpUri, verifyTotp } from "../domain/totp";
import {
  countUnusedBackupCodes,
  disableTwoFactor,
  getTwoFactorForUser,
  replaceBackupCodes,
  confirmEnrollment,
  upsertPendingEnrollment,
} from "../infra/mfa-repo";
import { findUserById } from "../infra/user-repo";
import { mfaDisabledMessage, mfaEnabledMessage } from "./email-templates";
import { sendAuthEmail } from "./jobs";
import { decryptTotpSecret, encryptTotpSecretForStorage } from "./totp-secrets";

const TOTP_SECRET_BYTES = 20;

export type MfaDeps = { db: Database; clock: Clock; mfaEncryptionKey: string };

/** Starts (or restarts) TOTP enrolment. Not active until confirmed with a live code. */
export async function startMfaEnrollment(
  userId: string,
  deps: MfaDeps,
): Promise<{ otpauthUri: string }> {
  const user = await findUserById(deps.db, userId);
  if (!user) throw new AppError("NOT_FOUND");
  const secret = randomBytes(TOTP_SECRET_BYTES);
  await upsertPendingEnrollment(
    deps.db,
    userId,
    encryptTotpSecretForStorage(secret, deps.mfaEncryptionKey),
  );
  return { otpauthUri: totpUri({ secret, accountLabel: user.email, issuer: brand.name }) };
}

export async function confirmMfaEnrollment(
  userId: string,
  code: string,
  deps: MfaDeps,
): Promise<{ backupCodes: string[] }> {
  const now = deps.clock.now();
  const twoFactor = await getTwoFactorForUser(deps.db, userId);
  if (!twoFactor) throw new AppError("BAD_REQUEST", { detail: "Start enrolment first." });
  const secret = decryptTotpSecret(twoFactor, deps.mfaEncryptionKey);
  const result = verifyTotp(secret, code, now, null);
  if (!result.valid)
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "code", code: "invalid", message: "Incorrect code." }],
    });

  const backupCodes = generateBackupCodes();
  const user = await findUserById(deps.db, userId);
  await deps.db.transaction(async (tx) => {
    await confirmEnrollment(tx, userId, result.counter, now);
    await replaceBackupCodes(
      tx,
      userId,
      backupCodes.map((code) => sha256Hex(code)),
    );
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "auth.mfa_enabled",
      targetType: "user",
      targetId: userId,
    });
    if (user) await enqueueJob(tx, sendAuthEmail, mfaEnabledMessage(user.email));
  });
  return { backupCodes };
}

export async function disableMfa(userId: string, deps: MfaDeps): Promise<void> {
  const user = await findUserById(deps.db, userId);
  await deps.db.transaction(async (tx) => {
    await disableTwoFactor(tx, userId);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "auth.mfa_disabled",
      targetType: "user",
      targetId: userId,
    });
    if (user) await enqueueJob(tx, sendAuthEmail, mfaDisabledMessage(user.email));
  });
}

export async function mfaStatus(
  userId: string,
  deps: MfaDeps,
): Promise<{ enabled: boolean; unusedBackupCodes: number }> {
  const twoFactor = await getTwoFactorForUser(deps.db, userId);
  const unusedBackupCodes = twoFactor?.enabled ? await countUnusedBackupCodes(deps.db, userId) : 0;
  return { enabled: twoFactor?.enabled ?? false, unusedBackupCodes };
}

import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { sha256Hex } from "@/server/platform/crypto";
import { writeAudit } from "@/server/platform/audit";
import { consumeToken } from "../infra/token-repo";
import { markEmailVerified } from "../infra/user-repo";

export async function verifyEmail(
  token: string,
  deps: { db: Database; clock: Clock },
): Promise<void> {
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    const row = await consumeToken(tx, "email_verify", sha256Hex(token), now);
    if (!row) throw new AppError("BAD_REQUEST", { detail: "This link is invalid or has expired." });
    await markEmailVerified(tx, row.userId);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: row.userId,
      action: "auth.email_verified",
      targetType: "user",
      targetId: row.userId,
    });
  });
}

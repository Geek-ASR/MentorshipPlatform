import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import { findUserById, updateUserAccount, type UserRow } from "../infra/user-repo";

/** Accepts any IANA zone the runtime knows (the same zones the browser offers). */
export function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Self-service account basics (docs/19 Phase 15): the name shown to mentors and students, and the
 * time zone every time in the UI is rendered in. Email and password changes have their own flows
 * (confirmation link, step-up), so they are deliberately not editable here.
 */
export async function updateAccount(
  userId: string,
  input: { displayName?: string; timezone?: string },
  deps: { db: Database; clock: Clock },
): Promise<UserRow> {
  if (input.timezone !== undefined && !isKnownTimeZone(input.timezone)) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        { path: "timezone", code: "invalid_timezone", message: "Choose a valid time zone." },
      ],
    });
  }
  return deps.db.transaction(async (tx) => {
    const before = await findUserById(tx, userId);
    if (!before) throw new AppError("NOT_FOUND");
    const changes = {
      ...(input.displayName !== undefined && input.displayName !== before.displayName
        ? { displayName: input.displayName }
        : {}),
      ...(input.timezone !== undefined && input.timezone !== before.timezone
        ? { timezone: input.timezone }
        : {}),
    };
    if (Object.keys(changes).length === 0) return before;
    const updated = await updateUserAccount(tx, userId, changes, deps.clock.now());
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: userId,
      action: "user.account_updated",
      targetType: "user",
      targetId: userId,
      metadata: { fields: Object.keys(changes) },
    });
    return updated;
  });
}

import { hasSqlState, type Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { insertCalendarBlock } from "../infra/session-repo";

/**
 * Reserves the host's time for a group session or event (docs/09 §6.2: one block per session).
 * The exclusion constraint is the real guard; a clash with another session or time off comes back
 * as a field error on the start time instead of an unexplained server error.
 */
export async function blockHostTime(
  tx: Executor,
  input: { hostUserId: string; sessionId: string; start: Date; end: Date },
): Promise<void> {
  try {
    await insertCalendarBlock(tx, {
      mentorId: input.hostUserId,
      sourceType: "session",
      sourceId: input.sessionId,
      start: input.start,
      end: input.end,
    });
  } catch (error) {
    if (hasSqlState(error, "23P01")) {
      throw new AppError("VALIDATION_FAILED", {
        errors: [
          {
            path: "start",
            code: "time_clash",
            message: "You already have a session or time off at this time. Pick another time.",
          },
        ],
      });
    }
    throw error;
  }
}

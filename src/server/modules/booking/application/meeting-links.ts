import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { checkMeetingLink, MEETING_LINK_MESSAGES } from "../domain/meeting-link";

/**
 * Validates a mentor-supplied meeting link against the admin allowlist (docs/09 §12) for services,
 * events and group sessions alike. `undefined` means "not provided", empty means "remove".
 */
export async function validatedMeetingUrl(
  db: Database,
  raw: string | null | undefined,
  now: Date,
): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null || raw.trim() === "") return null;
  const allowlist = await getSetting(db, "meeting.link_allowlist", now);
  const result = checkMeetingLink(raw, allowlist);
  if (!result.ok) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        { path: "meetingUrl", code: result.reason, message: MEETING_LINK_MESSAGES[result.reason] },
      ],
    });
  }
  return result.url;
}

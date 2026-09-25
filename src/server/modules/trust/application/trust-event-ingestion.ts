import { asc, gt } from "drizzle-orm";
import type { Database } from "@/server/platform/db/client";
import { auditLogs } from "@/server/platform/db/tables/platform";
import type { TrustEventType } from "../domain/types";
import { getIngestionWatermark, setIngestionWatermark } from "../infra/stats-repo";
import { recordTrustEvent } from "./trust-event-recording";

const BATCH_SIZE = 500;

type SignalMapping = { type: TrustEventType; subjectField: "mentorUserId" | "studentId" };

/** Every audit-log action `booking` pushes as a trust-event signal (ADR-035, mirroring ADR-029's
 * one-directional-DAG discipline) — `booking` never imports `trust`; this poller is the only place
 * that converts these facts into real, points-carrying `trust_events` rows. Event types with no
 * automatic producer this phase (`hold_abuse`, `mentor_late_arrival_reported`,
 * `chargeback_lost_friendly_fraud`, `verification_fraud`) are a documented Phase 10 deviation — the
 * catalog still lists them as valid types for a future producer or a manual staff-recorded event. */
const SIGNAL_MAP: Record<string, SignalMapping> = {
  "booking.mentor_no_show_signal": { type: "mentor_no_show", subjectField: "mentorUserId" },
  "booking.student_no_show_signal": { type: "student_no_show", subjectField: "studentId" },
  "booking.free_event_no_show_signal": { type: "free_event_no_show", subjectField: "studentId" },
  "booking.mentor_cancel_24_72h_signal": {
    type: "mentor_cancel_24_72h",
    subjectField: "mentorUserId",
  },
  "booking.mentor_late_cancel_24h_signal": {
    type: "mentor_late_cancel_24h",
    subjectField: "mentorUserId",
  },
  "booking.mentor_late_cancel_2h_signal": {
    type: "mentor_late_cancel_2h",
    subjectField: "mentorUserId",
  },
};

export type IngestionSummary = { scanned: number; recorded: number; skipped: number };

/**
 * Polls `audit_logs` past the last-seen id for booking's pushed signals and converts each into a
 * real `trust_events` row (docs/10 §4.2), re-evaluating both policy ladders per event via
 * `recordTrustEvent`. The watermark advances past every scanned row, signal or not, so a stretch of
 * unrelated activity between signals never gets rescanned on the next tick.
 */
export async function ingestPendingAuditSignals(
  db: Database,
  now: Date,
): Promise<IngestionSummary> {
  return db.transaction(async (tx) => {
    const watermark = await getIngestionWatermark(tx);
    const rows = await tx
      .select()
      .from(auditLogs)
      .where(gt(auditLogs.id, watermark))
      .orderBy(asc(auditLogs.id))
      .limit(BATCH_SIZE);

    let recorded = 0;
    let skipped = 0;
    let lastSeenId = watermark;

    for (const row of rows) {
      lastSeenId = row.id;
      const mapping = SIGNAL_MAP[row.action];
      if (!mapping) continue;
      const subjectUserId = row.metadata[mapping.subjectField];
      if (typeof subjectUserId !== "string") {
        skipped += 1;
        continue;
      }
      // sourceType/sourceId key off the booking, not this audit-log row's own id (`row.targetId` is
      // always the booking id — every booking-pushed signal audits with `targetType: "booking"`) so
      // `excuseTrustEventsFromSource(tx, "booking", bookingId, ...)` can later walk back exactly the
      // events a specific disputed booking produced (see `disputes.ts`).
      await recordTrustEvent(
        tx,
        {
          subjectUserId,
          type: mapping.type,
          sourceType: "booking",
          sourceId: row.targetId,
        },
        now,
      );
      recorded += 1;
    }

    if (lastSeenId > watermark) {
      await setIngestionWatermark(tx, lastSeenId);
    }

    return { scanned: rows.length, recorded, skipped };
  });
}

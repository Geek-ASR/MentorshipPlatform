import { z } from "zod";
import type { Executor } from "@/server/platform/db/client";
import { enqueueJob, defineJob } from "@/server/platform/outbox/outbox";
import { findUserById, sendAuthEmail } from "@/server/modules/auth";
import { findBooking } from "../infra/booking-repo";
import { findSession, sessionWindow } from "../infra/session-repo";
import { addMinutes } from "../domain/time";

function formatWhen(instant: Date): string {
  return instant.toISOString().replace(".000Z", "Z");
}

export async function notify(
  executor: Executor,
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  await enqueueJob(executor, sendAuthEmail, { to, subject, text });
}

export async function notifyBookingConfirmed(
  executor: Executor,
  input: { studentEmail: string; mentorEmail: string; start: Date; end: Date; joinUrl: string },
): Promise<void> {
  const when = `${formatWhen(input.start)} - ${formatWhen(input.end)}`;
  await notify(
    executor,
    input.studentEmail,
    "Your session is confirmed",
    `Your session is confirmed for ${when}.\nJoin link: ${input.joinUrl}`,
  );
  await notify(
    executor,
    input.mentorEmail,
    "New session booked",
    `A student booked a session with you for ${when}.\nJoin link: ${input.joinUrl}`,
  );
}

export async function notifyBookingCancelled(
  executor: Executor,
  input: { studentEmail: string; mentorEmail: string; start: Date; cancelledBy: string },
): Promise<void> {
  const when = formatWhen(input.start);
  const text = `The session scheduled for ${when} was cancelled by the ${input.cancelledBy}.`;
  await notify(executor, input.studentEmail, "Session cancelled", text);
  await notify(executor, input.mentorEmail, "Session cancelled", text);
}

export async function notifyBookingRescheduled(
  executor: Executor,
  input: { studentEmail: string; mentorEmail: string; newStart: Date },
): Promise<void> {
  const when = formatWhen(input.newStart);
  const text = `The session was rescheduled. New time: ${when}.`;
  await notify(executor, input.studentEmail, "Session rescheduled", text);
  await notify(executor, input.mentorEmail, "Session rescheduled", text);
}

const reminderPayloadSchema = z.object({
  bookingId: z.uuid(),
  kind: z.enum(["24h", "1h"]),
  scheduledForEpochMs: z.number(),
});

/** Re-validates the booking is still confirmed and unmoved before sending (docs/09 §13). */
export const sendBookingReminder = defineJob({
  type: "booking.send_reminder",
  schema: reminderPayloadSchema,
  maxAttempts: 6,
  async handle(payload, { db }) {
    const booking = await findBooking(db, payload.bookingId);
    if (!booking || booking.status !== "confirmed") return;
    const session = await findSession(db, booking.sessionId);
    if (!session) return;
    const { start } = sessionWindow(session);
    if (start.getTime() !== payload.scheduledForEpochMs) return; // rescheduled since this was queued

    const [student, mentor] = await Promise.all([
      findUserById(db, booking.studentId),
      findUserById(db, session.hostUserId),
    ]);
    if (!student || !mentor) return;
    const label = payload.kind === "24h" ? "tomorrow" : "in about an hour";
    const text = `Reminder: your session is ${label}, at ${formatWhen(start)}.`;
    await notify(db, student.email, "Upcoming session reminder", text);
    await notify(db, mentor.email, "Upcoming session reminder", text);
  },
});

const attendancePromptPayloadSchema = z.object({ bookingId: z.uuid() });

export const sendAttendancePrompt = defineJob({
  type: "booking.send_attendance_prompt",
  schema: attendancePromptPayloadSchema,
  maxAttempts: 6,
  async handle(payload, { db }) {
    const booking = await findBooking(db, payload.bookingId);
    if (!booking || !["awaiting_outcome", "confirmed"].includes(booking.status)) return;
    const student = await findUserById(db, booking.studentId);
    if (!student) return;
    await notify(
      db,
      student.email,
      "Did your session happen?",
      "Let us know how your session went so we can keep the marketplace reliable.",
    );
  },
});

export const bookingNotificationJobs = [sendBookingReminder, sendAttendancePrompt];

/** Schedules the two reminder emails and the two attendance prompts for a freshly confirmed booking. */
export async function scheduleBookingTimers(
  executor: Executor,
  bookingId: string,
  start: Date,
  end: Date,
  now: Date,
): Promise<void> {
  const startEpoch = start.getTime();
  for (const [kind, hoursBefore] of [
    ["24h", 24],
    ["1h", 1],
  ] as const) {
    const runAt = new Date(startEpoch - hoursBefore * 3_600_000);
    if (runAt <= now) continue;
    await enqueueJob(
      executor,
      sendBookingReminder,
      { bookingId, kind, scheduledForEpochMs: startEpoch },
      { runAt, dedupeKey: `booking:${bookingId}:reminder:${kind}:${startEpoch}` },
    );
  }
  for (const hoursAfterEnd of [1, 24]) {
    const runAt = addMinutes(end, hoursAfterEnd * 60);
    await enqueueJob(
      executor,
      sendAttendancePrompt,
      { bookingId },
      { runAt, dedupeKey: `booking:${bookingId}:attendance_prompt:${hoursAfterEnd}` },
    );
  }
}

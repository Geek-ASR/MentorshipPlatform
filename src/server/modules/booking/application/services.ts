import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { findMentorProfile } from "@/server/modules/profiles";
import { newId } from "@/server/platform/ids";
import {
  createService,
  findService,
  listServicesForMentor,
  setServiceActive,
  updateServiceDetails,
  type ServiceWithPrices,
} from "../infra/service-repo";
import { checkMeetingLink, MEETING_LINK_MESSAGES } from "../domain/meeting-link";

async function requireMentor(db: Database, userId: string): Promise<void> {
  const profile = await findMentorProfile(db, userId);
  if (!profile) throw new AppError("BAD_REQUEST", { detail: "Start a mentor application first." });
}

export async function listMyServices(
  db: Database,
  mentorUserId: string,
): Promise<ServiceWithPrices[]> {
  return listServicesForMentor(db, mentorUserId);
}

export type CreateServiceInput = {
  title: string;
  descriptionMd?: string | null;
  prices: { durationMin: number; priceMinor: number; currency: string }[];
  /** docs/09 §12 — validated against the admin allowlist. */
  meetingUrl?: string | null;
  /** Up to five optional questions students may answer when booking. */
  intakeQuestions?: { label: string }[];
};

async function validatedMeetingUrl(
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

function toIntakeQuestions(
  questions: { label: string }[] | undefined,
): { id: string; label: string }[] | undefined {
  return questions
    ?.map((q) => q.label.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((label) => ({ id: newId(), label }));
}

export async function createMentorService(
  db: Database,
  mentorUserId: string,
  input: CreateServiceInput,
  now: Date,
): Promise<ServiceWithPrices> {
  await requireMentor(db, mentorUserId);
  const allowedDurations = await getSetting(db, "service.allowed_durations_min", now);
  const durations = input.prices.map((p) => p.durationMin);
  const invalid = durations.filter((d) => !allowedDurations.includes(d));
  if (invalid.length > 0) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        {
          path: "prices",
          code: "duration_not_allowed",
          message: `Durations must be one of ${allowedDurations.join(", ")} minutes.`,
        },
      ],
    });
  }
  if (durations.length === 0) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        { path: "prices", code: "required", message: "At least one duration/price is required." },
      ],
    });
  }
  const meetingUrl = await validatedMeetingUrl(db, input.meetingUrl, now);
  return createService(db, {
    mentorUserId,
    title: input.title,
    descriptionMd: input.descriptionMd ?? null,
    allowedDurationsMin: durations,
    prices: input.prices,
    meetingUrl: meetingUrl ?? null,
    intakeQuestions: toIntakeQuestions(input.intakeQuestions),
  });
}

/** Changes to an existing service that never affect price or bookable slots. */
export async function updateMentorService(
  db: Database,
  mentorUserId: string,
  serviceId: string,
  changes: {
    isActive?: boolean;
    meetingUrl?: string | null;
    intakeQuestions?: { label: string }[];
  },
  now: Date,
): Promise<ServiceWithPrices> {
  await requireMentor(db, mentorUserId);
  const service = await findService(db, serviceId);
  if (!service || service.mentorUserId !== mentorUserId) throw new AppError("NOT_FOUND");
  const meetingUrl = await validatedMeetingUrl(db, changes.meetingUrl, now);
  await updateServiceDetails(db, serviceId, {
    ...(meetingUrl !== undefined ? { meetingUrl } : {}),
    ...(changes.intakeQuestions !== undefined
      ? { intakeQuestions: toIntakeQuestions(changes.intakeQuestions) ?? [] }
      : {}),
  });
  if (changes.isActive !== undefined) {
    await setServiceActive(db, mentorUserId, serviceId, changes.isActive);
  }
  return (await findService(db, serviceId))!;
}

export async function setMentorServiceActive(
  db: Database,
  mentorUserId: string,
  serviceId: string,
  isActive: boolean,
): Promise<void> {
  await requireMentor(db, mentorUserId);
  const service = await findService(db, serviceId);
  if (!service || service.mentorUserId !== mentorUserId) {
    throw new AppError("NOT_FOUND");
  }
  await setServiceActive(db, mentorUserId, serviceId, isActive);
}

export { findService };

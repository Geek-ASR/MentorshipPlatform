import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { findMentorProfile } from "@/server/modules/profiles";
import {
  createService,
  findService,
  listServicesForMentor,
  setServiceActive,
  type ServiceWithPrices,
} from "../infra/service-repo";

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
};

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
  return createService(db, {
    mentorUserId,
    title: input.title,
    descriptionMd: input.descriptionMd ?? null,
    allowedDurationsMin: durations,
    prices: input.prices,
  });
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

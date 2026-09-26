import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { mentorServices, servicePrices } from "./tables";

export type MentorServiceRow = typeof mentorServices.$inferSelect;
export type ServicePriceRow = typeof servicePrices.$inferSelect;
export type ServiceWithPrices = MentorServiceRow & { prices: ServicePriceRow[] };

async function attachPrices(
  executor: Executor,
  service: MentorServiceRow,
): Promise<ServiceWithPrices> {
  const prices = await executor
    .select()
    .from(servicePrices)
    .where(eq(servicePrices.serviceId, service.id));
  return { ...service, prices };
}

export async function listServicesForMentor(
  executor: Executor,
  mentorUserId: string,
): Promise<ServiceWithPrices[]> {
  const rows = await executor
    .select()
    .from(mentorServices)
    .where(eq(mentorServices.mentorUserId, mentorUserId));
  return Promise.all(rows.map((row) => attachPrices(executor, row)));
}

export async function findService(
  executor: Executor,
  id: string,
): Promise<ServiceWithPrices | undefined> {
  const [row] = await executor
    .select()
    .from(mentorServices)
    .where(eq(mentorServices.id, id))
    .limit(1);
  return row ? attachPrices(executor, row) : undefined;
}

export async function createService(
  executor: Executor,
  input: {
    mentorUserId: string;
    title: string;
    descriptionMd: string | null;
    allowedDurationsMin: number[];
    prices: { durationMin: number; priceMinor: number; currency: string }[];
    intakeQuestions?: { id: string; label: string }[];
    meetingUrl?: string | null;
  },
): Promise<ServiceWithPrices> {
  const [row] = await executor
    .insert(mentorServices)
    .values({
      id: newId(),
      mentorUserId: input.mentorUserId,
      kind: "one_on_one",
      title: input.title,
      descriptionMd: input.descriptionMd,
      allowedDurationsMin: input.allowedDurationsMin,
      intakeQuestions: input.intakeQuestions ?? [],
      meetingUrl: input.meetingUrl ?? null,
    })
    .returning();
  const prices = input.prices.length
    ? await executor
        .insert(servicePrices)
        .values(
          input.prices.map((p) => ({
            id: newId(),
            serviceId: row!.id,
            durationMin: p.durationMin,
            priceMinor: p.priceMinor,
            currency: p.currency,
          })),
        )
        .returning()
    : [];
  return { ...row!, prices };
}

export async function updateServiceDetails(
  executor: Executor,
  serviceId: string,
  changes: { meetingUrl?: string | null; intakeQuestions?: { id: string; label: string }[] },
): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  await executor
    .update(mentorServices)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(mentorServices.id, serviceId));
}

/** A group session's "service" row (docs/09 §8) — kind='group', no `service_prices`: the seat price
 * lives directly on the `sessions` row (one specific time, not duration-generated slots). */
export async function insertGroupServiceRow(
  executor: Executor,
  input: { mentorUserId: string; title: string; descriptionMd: string | null },
): Promise<MentorServiceRow> {
  const [row] = await executor
    .insert(mentorServices)
    .values({
      id: newId(),
      mentorUserId: input.mentorUserId,
      kind: "group",
      title: input.title,
      descriptionMd: input.descriptionMd,
      allowedDurationsMin: [],
    })
    .returning();
  return row!;
}

export async function setServiceActive(
  executor: Executor,
  mentorUserId: string,
  serviceId: string,
  isActive: boolean,
): Promise<void> {
  await executor
    .update(mentorServices)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(mentorServices.id, serviceId), eq(mentorServices.mentorUserId, mentorUserId)));
}

export async function priceForDuration(
  executor: Executor,
  serviceId: string,
  durationMin: number,
): Promise<ServicePriceRow | undefined> {
  const [row] = await executor
    .select()
    .from(servicePrices)
    .where(and(eq(servicePrices.serviceId, serviceId), eq(servicePrices.durationMin, durationMin)))
    .limit(1);
  return row;
}

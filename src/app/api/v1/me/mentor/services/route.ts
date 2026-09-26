import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { createMentorService, listMyServices } from "@/server/modules/booking";

export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor/services" },
  async ({ actor, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const services = await listMyServices(await getDb(), actor.userId);
    return { body: services };
  },
);

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  descriptionMd: z.string().max(5000).optional(),
  prices: z
    .array(
      z.object({
        durationMin: z.number().int().min(15).max(180),
        priceMinor: z.number().int().min(0),
        currency: z.string().length(3),
      }),
    )
    .min(1)
    .max(6),
  meetingUrl: z.string().max(500).nullable().optional(),
  intakeQuestions: z
    .array(z.object({ label: z.string().trim().min(1).max(200) }))
    .max(5)
    .optional(),
});

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor/services", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const service = await createMentorService(await getDb(), actor.userId, body, clock.now());
    return { status: 201, body: service };
  },
);

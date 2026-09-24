import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { createGroupSession } from "@/server/modules/booking";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  descriptionMd: z.string().max(5000).optional(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  capacity: z.number().int().min(2).max(100),
  minParticipants: z.number().int().min(1).optional(),
  targetTotalMinor: z.number().int().min(0),
  currency: z.string().length(3).default("INR"),
});

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor/group-sessions", body: bodySchema, idempotency: "required" },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await createGroupSession(
      await getDb(),
      actor.userId,
      { ...body, start: new Date(body.start), end: new Date(body.end) },
      clock.now(),
    );
    return { status: 201, body: result };
  },
);

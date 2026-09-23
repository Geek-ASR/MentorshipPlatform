import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import {
  addMentorAvailabilityException,
  AVAILABILITY_EXCEPTION_KINDS,
  listMentorAvailabilityExceptions,
} from "@/server/modules/booking";

export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor/availability-exceptions" },
  async ({ actor, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const exceptions = await listMentorAvailabilityExceptions(await getDb(), actor.userId);
    return { body: exceptions };
  },
);

const bodySchema = z.object({
  kind: z.enum(AVAILABILITY_EXCEPTION_KINDS),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  localSpec: z.record(z.string(), z.unknown()).default({}),
});

export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor/availability-exceptions", body: bodySchema },
  async ({ actor, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const exception = await addMentorAvailabilityException(await getDb(), actor.userId, {
      kind: body.kind,
      start: new Date(body.start),
      end: new Date(body.end),
      localSpec: body.localSpec,
    });
    return { status: 201, body: exception };
  },
);

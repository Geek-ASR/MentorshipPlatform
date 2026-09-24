import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { listMyWaitlistEntries } from "@/server/modules/booking";

export const GET = defineRoute({ name: "GET /api/v1/me/waitlist" }, async ({ actor, getDb }) => {
  if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
  const entries = await listMyWaitlistEntries(await getDb(), actor.userId);
  return { body: { entries }, headers: { "cache-control": "no-store" } };
});

import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { listRefundsForStudent } from "@/server/modules/payments";

export const GET = defineRoute({ name: "GET /api/v1/me/refunds" }, async ({ actor, getDb }) => {
  if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
  const refunds = await listRefundsForStudent(await getDb(), actor.userId);
  return { body: { refunds }, headers: { "cache-control": "no-store" } };
});

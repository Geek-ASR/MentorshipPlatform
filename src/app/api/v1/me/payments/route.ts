import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { listPaymentsForStudent } from "@/server/modules/payments";

export const GET = defineRoute({ name: "GET /api/v1/me/payments" }, async ({ actor, getDb }) => {
  if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
  const payments = await listPaymentsForStudent(await getDb(), actor.userId);
  return { body: { payments }, headers: { "cache-control": "no-store" } };
});

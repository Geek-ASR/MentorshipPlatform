import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { listTransfersForMentor } from "@/server/modules/payments";

/** A mentor's own earnings view (docs/06 §7.6). */
export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor/transfers" },
  async ({ actor, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const transfers = await listTransfersForMentor(await getDb(), actor.userId);
    return { body: { transfers }, headers: { "cache-control": "no-store" } };
  },
);

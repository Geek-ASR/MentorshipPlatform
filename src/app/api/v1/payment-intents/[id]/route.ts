import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { findOrder, findPaymentIntent } from "@/server/modules/payments";

const paramsSchema = z.object({ id: z.uuid() });

/** Status polling after checkout (docs/06 §7.6) — owner only. */
export const GET = defineRoute(
  { name: "GET /api/v1/payment-intents/:id", params: paramsSchema },
  async ({ actor, params, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const db = await getDb();
    const intent = await findPaymentIntent(db, params.id);
    if (!intent) throw new AppError("NOT_FOUND");
    const order = await findOrder(db, intent.orderId);
    if (!order || order.studentId !== actor.userId) throw new AppError("NOT_FOUND");
    return { body: intent, headers: { "cache-control": "no-store" } };
  },
);

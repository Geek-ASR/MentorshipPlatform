import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { simulateFakeCheckout } from "@/server/modules/payments";
import { POST as fakeWebhook } from "@/app/api/webhooks/fake/route";

const bodySchema = z.object({
  providerOrderId: z.string().min(1),
  outcome: z.enum(["succeed", "fail", "dispute"]),
});

/**
 * Drives the dev checkout flow's outcome (docs/08 §14): flips the fake provider's own state, then
 * dispatches a genuinely HMAC-signed webhook to the real `/api/webhooks/fake` route handler — the
 * exact code path a real Razorpay webhook would take, not a shortcut that only updates our own rows.
 */
export const POST = defineRoute(
  { name: "POST /api/v1/dev/fake-checkout", body: bodySchema, idempotency: "required" },
  async ({ actor, body, getDb, clock, env }) => {
    if (env.PAYMENTS_PROVIDER !== "fake" || env.NODE_ENV === "production") {
      throw new AppError("NOT_FOUND");
    }
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const db = await getDb();
    const payload = await simulateFakeCheckout(db, body.providerOrderId, body.outcome, clock.now());

    const webhookResponse = await fakeWebhook(
      new Request(`${env.APP_BASE_URL}/api/webhooks/fake`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-fake-signature": payload.signature },
        body: payload.body,
      }),
      { params: Promise.resolve({}) },
    );
    const webhookResult = await webhookResponse.json();
    return {
      status: 200,
      body: { outcome: body.outcome, eventType: payload.eventType, webhook: webhookResult },
    };
  },
);

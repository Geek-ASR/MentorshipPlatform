import { defineRoute } from "@/server/platform/http/route";
import { AppError } from "@/server/platform/errors";
import { receiveWebhook } from "@/server/modules/payments";

/**
 * Fake-provider webhook receiver (docs/08 §6, §14). Disabled unless `PAYMENTS_PROVIDER=fake` and
 * not production, matching the dev-checkout page's own gate. Reads raw bytes before any JSON
 * parsing — the HMAC is computed over the exact wire bytes, so `defineRoute`'s body-schema parsing
 * (which would re-serialize) is bypassed entirely; this route reads the body itself.
 */
export const POST = defineRoute(
  { name: "POST /api/webhooks/fake", actor: "none", csrf: "none", maxBodyBytes: 256 * 1024 },
  async ({ request, getDb, env }) => {
    if (env.PAYMENTS_PROVIDER !== "fake" || env.NODE_ENV === "production") {
      throw new AppError("NOT_FOUND");
    }
    const rawBody = await request.text();
    const signature = request.headers.get("x-fake-signature") ?? "";
    const result = await receiveWebhook(await getDb(), "fake", rawBody, signature);
    if (result.status === "invalid_signature")
      throw new AppError("BAD_REQUEST", { detail: "Invalid signature." });
    return { status: 200, body: { status: result.status } };
  },
);

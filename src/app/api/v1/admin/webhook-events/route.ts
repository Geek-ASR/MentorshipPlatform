import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireStaff } from "@/server/platform/authz/authorize";
import { listWebhookEvents } from "@/server/modules/payments";

export const GET = defineRoute(
  { name: "GET /api/v1/admin/webhook-events" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireStaff(["admin", "super_admin", "finance"]), undefined, {
      now: clock.now(),
    });
    const events = await listWebhookEvents(await getDb());
    return { body: { events }, headers: { "cache-control": "no-store" } };
  },
);

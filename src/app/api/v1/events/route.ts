import { defineRoute } from "@/server/platform/http/route";
import { listPublicEvents } from "@/server/modules/booking";

/** Public, indexable upcoming events (docs/22 §10.1 `/events`). */
export const GET = defineRoute({ name: "GET /api/v1/events" }, async ({ getDb, clock }) => {
  const events = await listPublicEvents(await getDb(), clock.now());
  return { body: { events } };
});

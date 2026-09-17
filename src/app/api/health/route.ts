import { defineRoute } from "@/server/platform/http/route";

/** Liveness: process is up. No dependencies, no details. */
export const GET = defineRoute({ name: "GET /api/health", actor: "none" }, async () => ({
  body: { status: "ok" },
}));

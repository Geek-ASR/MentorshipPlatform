import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { createEventInvite, listEventInvites } from "@/server/modules/booking";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ expiresAt: z.iso.datetime().optional() });

/** One single-use invite token per call (docs/09 §9 "private (invite tokens)") — the raw token is
 * returned once here and never persisted; the host copies it into their own invite link/email. */
export const POST = defineRoute(
  {
    name: "POST /api/v1/me/events/:id/invites",
    params: paramsSchema,
    body: bodySchema,
    idempotency: "required",
  },
  async ({ actor, params, body, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const result = await createEventInvite(
      await getDb(),
      actor.userId,
      params.id,
      body.expiresAt ? new Date(body.expiresAt) : null,
    );
    return { status: 201, body: result };
  },
);

export const GET = defineRoute(
  { name: "GET /api/v1/me/events/:id/invites", params: paramsSchema },
  async ({ actor, params, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const invites = await listEventInvites(await getDb(), actor.userId, params.id);
    // Never return the token hash — it's not the secret, but there's no reason to expose it either.
    return {
      body: { invites: invites.map(({ token: _token, ...rest }) => rest) },
      headers: { "cache-control": "no-store" },
    };
  },
);

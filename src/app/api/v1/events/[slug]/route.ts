import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { isStaff } from "@/server/platform/authz/actor";
import { sha256Hex } from "@/server/platform/crypto";
import { AppError } from "@/server/platform/errors";
import { findEventBySlug, findEventInviteByToken } from "@/server/modules/booking";

const paramsSchema = z.object({ slug: z.string().min(1).max(200) });
const querySchema = z.object({ inviteToken: z.string().min(1).max(200).optional() });

/** Public event page (docs/22 §10.1, docs/09 §9): `public`/`unlisted` are visible to anyone with the
 * link; `private` needs the host, staff, or a valid (unused, unexpired) invite token — checked
 * read-only here, never marked used (only actually registering does that, docs/09 §9). */
export const GET = defineRoute(
  { name: "GET /api/v1/events/:slug", params: paramsSchema, query: querySchema },
  async ({ actor, params, query, getDb, clock }) => {
    const event = await findEventBySlug(await getDb(), params.slug);
    if (!event) throw new AppError("NOT_FOUND");

    if (event.visibility === "private") {
      const isHost = actor.kind === "user" && actor.userId === event.session.hostUserId;
      if (!isHost && !isStaff(actor)) {
        const invite = query.inviteToken
          ? await findEventInviteByToken(
              await getDb(),
              event.sessionId,
              sha256Hex(query.inviteToken),
            )
          : undefined;
        const now = clock.now();
        const validInvite =
          invite && invite.usedAt === null && (invite.expiresAt === null || invite.expiresAt > now);
        if (!validInvite) throw new AppError("NOT_FOUND");
      }
    }

    return { body: event };
  },
);

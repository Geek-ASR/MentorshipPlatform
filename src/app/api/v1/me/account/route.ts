import { z } from "zod";
import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { mfaStatus, toMeDto, updateAccount } from "@/server/modules/auth";
import { refreshMentorListing } from "@/server/modules/profiles";

const bodySchema = z
  .object({
    displayName: z.string().trim().min(1, "Enter your name.").max(120).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((body) => body.displayName !== undefined || body.timezone !== undefined, {
    message: "Nothing to update.",
  });

/** docs/19 Phase 15: self-service name and time zone (email/password have their own flows). */
export const PATCH = defineRoute(
  {
    name: "PATCH /api/v1/me/account",
    body: bodySchema,
    rateLimit: { limit: 30, windowSeconds: 3600, by: "actor" },
  },
  async ({ actor, body, getDb, env, clock }) => {
    authorize(actor, requireUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");

    const db = await getDb();
    const user = await updateAccount(actor.userId, body, { db, clock });
    // A mentor's name is part of their search document — keep "search by name" current.
    if (body.displayName !== undefined && actor.roles.has("mentor")) {
      await refreshMentorListing(db, actor.userId, clock.now());
    }
    const { enabled } = await mfaStatus(actor.userId, {
      db,
      clock,
      mfaEncryptionKey: env.MFA_ENCRYPTION_KEY,
    });
    return { body: toMeDto(user, actor, enabled) };
  },
);

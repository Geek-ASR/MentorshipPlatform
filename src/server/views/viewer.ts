import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserActor } from "@/server/platform/authz/actor";
import { getDb } from "@/server/platform/db/client";
import { getPageActor } from "@/server/platform/http/page-actor";
import { PREVIEW, PREVIEW_ACCOUNTS, PREVIEW_PERSONA } from "@/config/preview";
import {
  findUserByEmail,
  findUserById,
  listRestrictionRowsForUser,
  rolesForUser,
  toActiveRestrictions,
  type UserRow,
} from "@/server/modules/auth";
import type { Role } from "@/server/platform/authz/actor";

export type PageViewer = { actor: UserActor; user: UserRow };

/**
 * The signed-in person for a Server Component, memoised per request with React `cache()` so a
 * layout and its page share one session lookup. Null for anonymous visitors.
 */
export const loadPageViewer = cache(async (): Promise<PageViewer | null> => {
  if (PREVIEW) return previewViewer();
  const actor = await getPageActor();
  if (actor.kind !== "user") return null;
  const user = await findUserById(await getDb(), actor.userId);
  return user ? { actor, user } : null;
});

/**
 * Gate for signed-in pages (docs/19 Phase 15a). Each page passes its own path so sign-in returns
 * the visitor exactly where they were going — layouts don't know the current path, so the redirect
 * lives in pages, never in the dashboard layout.
 */
export async function requireViewer(returnTo: string): Promise<PageViewer> {
  const viewer = await loadPageViewer();
  if (!viewer) redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  return viewer;
}

/** The client-safe subset the shell's account menu needs (mirrors `Viewer` in `@/ui/viewer`). */
export function toClientViewer({ actor, user }: PageViewer) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    timezone: user.timezone,
    status: user.status,
    roles: [...actor.roles] as string[],
  };
}

/**
 * The static preview has no sessions or cookies: every signed-in page renders as the persona's
 * demo account (docs/19 Phase 15e). Only reachable when `NEXT_PUBLIC_PREVIEW` is set at build time.
 */
async function previewViewer(): Promise<PageViewer | null> {
  const db = await getDb();
  const user = await findUserByEmail(db, `${PREVIEW_ACCOUNTS[PREVIEW_PERSONA].key}@example.com`);
  if (!user) return null;
  const [roles, restrictionRows] = await Promise.all([
    rolesForUser(db, user.id),
    listRestrictionRowsForUser(db, user.id),
  ]);
  const now = new Date();
  return {
    user,
    actor: {
      kind: "user",
      userId: user.id,
      sessionId: "preview",
      roles: new Set(roles as Role[]),
      status: user.status,
      restrictions: toActiveRestrictions(restrictionRows, now),
      emailVerified: user.emailVerified,
      mfaVerified: false,
      authenticatedAt: now,
    },
  };
}

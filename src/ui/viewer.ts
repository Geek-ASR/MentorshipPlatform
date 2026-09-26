"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

/** Client-side mirror of the server's `MeDto` (client code must not import server modules). */
export type Viewer = {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  timezone: string;
  status: string;
  roles: string[];
  /** Present on `/auth/viewer` responses; server-rendered shells omit it. */
  mfaEnabled?: boolean;
};

export type ViewerState = { status: "loading" } | { status: "ready"; viewer: Viewer | null };

/** Who is signed in, for statically rendered pages (one request per mount, never a 401). */
export function useViewer(): ViewerState {
  const [state, setState] = useState<ViewerState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    api<{ viewer: Viewer | null }>("/api/v1/auth/viewer")
      .then((result) => !cancelled && setState({ status: "ready", viewer: result.viewer }))
      .catch(() => !cancelled && setState({ status: "ready", viewer: null }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Signs this device out, then does a full navigation so every layout re-renders signed out. */
export async function signOut(redirectTo = "/"): Promise<void> {
  await api("/api/v1/auth/sign-out", { method: "POST" }).catch(() => undefined);
  window.location.assign(redirectTo);
}

/** Mirrors `STAFF_ROLES` in platform/authz — only decides whether to show a link; the admin
 * area enforces access server-side. */
const STAFF_ROLE_NAMES = new Set([
  "content_editor",
  "verification_reviewer",
  "moderator",
  "finance",
  "admin",
  "super_admin",
]);

export function isStaff(roles: string[]): boolean {
  return roles.some((role) => STAFF_ROLE_NAMES.has(role));
}

"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during server rendering and hydration, true afterwards — for values that only exist in
 * the browser (its time zone, the runtime's zone list). React renders the server snapshot while
 * hydrating, so the HTML always matches, then re-renders once with the client value.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** The browser's IANA time zone after hydration; `fallback` on the server and while hydrating. */
export function useBrowserTimeZone(fallback: string): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || fallback,
    () => fallback,
  );
}

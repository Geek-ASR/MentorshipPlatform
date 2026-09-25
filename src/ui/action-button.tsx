"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "./admin-fetch";
import { Button } from "./button";

/**
 * A single-purpose admin action button — POSTs/DELETEs to an existing route (reusing the same
 * idempotency/audit/authorization guarantees the route already enforces) and refreshes the page's
 * server data on success. `confirmText` gates destructive actions behind a native confirm dialog
 * (no Radix Dialog dependency yet — see the Phase 11 retrospective for that scope trim). A
 * `REAUTH_REQUIRED` response (docs/07 §5 step-up) redirects to a full re-sign-in.
 */
export function ActionButton({
  path,
  method = "POST",
  body,
  confirmText,
  variant,
  className,
  children,
  onDone,
}: {
  path: string;
  method?: "POST" | "DELETE";
  body?: unknown;
  confirmText?: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  className?: string;
  children: ReactNode;
  onDone?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={className}
        disabled={pending}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(null);
          setPending(true);
          try {
            await adminFetch(path, { method, body });
            router.refresh();
            onDone?.();
          } catch (err) {
            if (isReauthRequired(err)) {
              router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
              return;
            }
            setError(err instanceof Error ? err.message : "Something went wrong.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "…" : children}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

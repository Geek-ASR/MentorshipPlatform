"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "@/ui/admin-fetch";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

type Flag = { key: string; enabled: boolean; description: string };

export function FlagRow({ flag }: { flag: Flag }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const reason = window.prompt(
      `Reason for turning "${flag.key}" ${flag.enabled ? "off" : "on"}?`,
    );
    if (!reason) return;
    setError(null);
    setPending(true);
    try {
      await adminFetch(`/api/v1/admin/feature-flags/${flag.key}`, {
        method: "PUT",
        body: { enabled: !flag.enabled, reason },
      });
      router.refresh();
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't update that flag.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink">{flag.key}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{flag.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={flag.enabled ? "primary" : "neutral"}>{flag.enabled ? "on" : "off"}</Badge>
          <Button size="sm" variant="secondary" disabled={pending} onClick={toggle}>
            {pending ? "…" : flag.enabled ? "Turn off" : "Turn on"}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </Card>
  );
}

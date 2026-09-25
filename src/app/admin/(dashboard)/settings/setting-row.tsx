"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "@/ui/admin-fetch";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Field, Input, Textarea } from "@/ui/input";

type Setting = { key: string; value: unknown; description: string; critical: boolean };

export function SettingRow({
  setting,
  canEditCritical,
}: {
  setting: Setting;
  canEditCritical: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [valueText, setValueText] = useState(JSON.stringify(setting.value, null, 2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const locked = setting.critical && !canEditCritical;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(valueText);
    } catch {
      setError("That's not valid JSON.");
      return;
    }
    setPending(true);
    try {
      await adminFetch(`/api/v1/admin/settings/${setting.key}`, {
        method: "PUT",
        body: { value: parsedValue, reason },
      });
      router.refresh();
      setOpen(false);
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't save that setting.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink">{setting.key}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{setting.description}</p>
          <p className="tabular mt-2 text-sm text-ink">{JSON.stringify(setting.value)}</p>
        </div>
        <div className="flex items-center gap-2">
          {setting.critical ? <Badge tone="accent">critical</Badge> : null}
          {!locked ? (
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
              {open ? "Cancel" : "Edit"}
            </Button>
          ) : (
            <span className="text-xs text-ink-muted">super_admin only</span>
          )}
        </div>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-line pt-4">
          <Field label="New value (JSON)" htmlFor={`value-${setting.key}`}>
            <Textarea
              id={`value-${setting.key}`}
              rows={4}
              className="font-mono"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
            />
          </Field>
          <Field label="Reason" htmlFor={`reason-${setting.key}`}>
            <Input
              id={`reason-${setting.key}`}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

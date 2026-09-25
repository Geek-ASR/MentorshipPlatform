"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "@/ui/admin-fetch";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Field, Input, Textarea } from "@/ui/input";

type Rule = {
  id: string;
  ruleKey: string;
  subjectRole: string;
  enabled: boolean;
  version: number;
  ruleBody: unknown;
};

export function PolicyRuleRow({ rule }: { rule: Rule }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [bodyText, setBodyText] = useState(JSON.stringify(rule.ruleBody, null, 2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toggleEnabled() {
    const toggleReason = window.prompt(
      `Reason for turning "${rule.ruleKey}" ${rule.enabled ? "off" : "on"}?`,
    );
    if (!toggleReason) return;
    setError(null);
    setPending(true);
    try {
      await adminFetch(`/api/v1/admin/policy-rules/${rule.id}`, {
        method: "PUT",
        body: { enabled: !rule.enabled, reason: toggleReason },
      });
      router.refresh();
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't update that rule.");
    } finally {
      setPending(false);
    }
  }

  async function saveBody(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let ruleBody: unknown;
    try {
      ruleBody = JSON.parse(bodyText);
    } catch {
      setError("That's not valid JSON.");
      return;
    }
    setPending(true);
    try {
      await adminFetch(`/api/v1/admin/policy-rules/${rule.id}`, {
        method: "PUT",
        body: { ruleBody, reason },
      });
      router.refresh();
      setOpen(false);
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't save the rule body.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink">{rule.ruleKey}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {rule.subjectRole} · v{rule.version}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={rule.enabled ? "primary" : "neutral"}>
            {rule.enabled ? "enabled" : "disabled"}
          </Badge>
          <Button size="sm" variant="secondary" disabled={pending} onClick={toggleEnabled}>
            {rule.enabled ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Edit body"}
          </Button>
        </div>
      </div>

      {open ? (
        <form onSubmit={saveBody} className="mt-4 space-y-3 border-t border-line pt-4">
          <Field label="Rule body (JSON)" htmlFor={`body-${rule.id}`}>
            <Textarea
              id={`body-${rule.id}`}
              rows={10}
              className="font-mono"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
          </Field>
          <Field label="Reason" htmlFor={`reason-${rule.id}`}>
            <Input
              id={`reason-${rule.id}`}
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
      ) : error ? (
        <p className="mt-2 text-xs text-danger">{error}</p>
      ) : null}
    </Card>
  );
}

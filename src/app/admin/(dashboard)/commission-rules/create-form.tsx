"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "@/ui/admin-fetch";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Field, Input, Select } from "@/ui/input";

const SCOPE_TYPES = ["global", "service_kind", "category", "promotion", "mentor"] as const;

export function CreateCommissionRuleForm() {
  const router = useRouter();
  const pathname = usePathname();
  const [scopeType, setScopeType] = useState<(typeof SCOPE_TYPES)[number]>("global");
  const [scopeRef, setScopeRef] = useState("");
  const [percent, setPercent] = useState("10");
  const [priority, setPriority] = useState("0");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await adminFetch("/api/v1/admin/commission-rules", {
        body: {
          scopeType,
          scopeRef: scopeType === "global" ? undefined : scopeRef || undefined,
          percentBps: Math.round(Number(percent) * 100),
          priority: Number(priority),
          reason,
        },
      });
      router.refresh();
      setReason("");
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't create the rule.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-ink">New rule</h2>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Scope" htmlFor="scopeType">
          <Select
            id="scopeType"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as typeof scopeType)}
          >
            {SCOPE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        {scopeType !== "global" ? (
          <Field
            label="Scope reference"
            htmlFor="scopeRef"
            hint="e.g. a mentor id or category slug"
          >
            <Input id="scopeRef" value={scopeRef} onChange={(e) => setScopeRef(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Rate (%)" htmlFor="percent">
          <Input
            id="percent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </Field>
        <Field label="Priority" htmlFor="priority" hint="Higher wins on overlap">
          <Input
            id="priority"
            type="number"
            min={0}
            max={100}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </Field>
        <Field label="Reason" htmlFor="reason">
          <Input id="reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create rule"}
        </Button>
      </form>
    </Card>
  );
}

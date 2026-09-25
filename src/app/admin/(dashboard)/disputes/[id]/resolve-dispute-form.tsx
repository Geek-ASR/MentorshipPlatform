"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Field, Input, Select, Textarea } from "@/ui/input";

const RESOLUTIONS = ["full_refund", "partial_refund", "no_refund"] as const;

export function ResolveDisputeForm({
  disputeId,
  appealed,
}: {
  disputeId: string;
  appealed: boolean;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("full_refund");
  const [atFaultUserId, setAtFaultUserId] = useState("");
  const [partialRefundPct, setPartialRefundPct] = useState("50");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/v1/admin/disputes/${disputeId}/resolution`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          resolution,
          atFaultUserId: atFaultUserId || null,
          partialRefundPct: resolution === "partial_refund" ? Number(partialRefundPct) : undefined,
          rationale,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          title?: string;
          detail?: string;
        } | null;
        throw new Error(data?.detail ?? data?.title ?? "Couldn't resolve the dispute.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-ink">{appealed ? "Decide appeal" : "Resolve"}</h2>
      {appealed ? (
        <p className="mb-3 text-xs text-ink-muted">
          Picking the same resolution as before upholds it; a different one overturns it. Money
          already refunded is never reversed (docs/19 Phase 10 retrospective).
        </p>
      ) : null}
      <form onSubmit={submit} className="space-y-3">
        <Field label="Resolution" htmlFor="resolution">
          <Select
            id="resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as typeof resolution)}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        {resolution === "partial_refund" ? (
          <Field label="Refund %" htmlFor="partialRefundPct">
            <Input
              id="partialRefundPct"
              type="number"
              min={0}
              max={100}
              value={partialRefundPct}
              onChange={(e) => setPartialRefundPct(e.target.value)}
            />
          </Field>
        ) : null}

        <Field label="At-fault user id (optional)" htmlFor="atFaultUserId">
          <Input
            id="atFaultUserId"
            value={atFaultUserId}
            onChange={(e) => setAtFaultUserId(e.target.value)}
          />
        </Field>

        <Field label="Rationale" htmlFor="rationale">
          <Textarea
            id="rationale"
            rows={3}
            required
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
        </Field>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Submitting…" : appealed ? "Decide" : "Resolve"}
        </Button>
      </form>
    </Card>
  );
}

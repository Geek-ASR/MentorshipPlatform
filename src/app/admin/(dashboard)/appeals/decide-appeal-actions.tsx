"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";

async function decide(
  appealId: string,
  status: "upheld" | "modified" | "overturned",
  note: string,
) {
  const response = await fetch(`/api/v1/admin/appeals/${appealId}/decision`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ status, note: note || undefined }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      title?: string;
      detail?: string;
    } | null;
    throw new Error(data?.detail ?? data?.title ?? "Couldn't decide the appeal.");
  }
}

export function DecideAppealActions({ appealId }: { appealId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(status: "upheld" | "modified" | "overturned") {
    setError(null);
    setPending(true);
    try {
      await decide(appealId, status, note);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="h-8 w-40 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-xs"
      />
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("upheld")}>
          Uphold
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("modified")}>
          Modify
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => run("overturned")}
        >
          Overturn
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

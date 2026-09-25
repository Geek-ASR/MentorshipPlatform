"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/ui/admin-fetch";
import { Button } from "@/ui/button";

export function RevokeCredentialButton({
  credentialId,
  mentorUserId,
}: {
  credentialId: string;
  mentorUserId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    const reason = window.prompt("Reason for revoking this credential?");
    if (!reason) return;
    setError(null);
    setPending(true);
    try {
      await adminFetch(`/api/v1/admin/verification/credentials/${credentialId}/revoke`, {
        body: { mentorUserId, reason },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke that credential.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant="destructive" disabled={pending} onClick={revoke}>
        {pending ? "…" : "Revoke"}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

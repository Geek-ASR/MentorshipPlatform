"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/input";
import { useToast } from "@/ui/toast";

/** One public reply per review (docs/10 §4.4) — shown under the review on the profile. */
export function RespondForm({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Reply publicly
      </Button>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const result = await api<{ status: string }>(`/api/v1/reviews/${reviewId}/response`, {
        method: "POST",
        body: { body: body.trim() },
      });
      toast(
        result.status === "published"
          ? { title: "Reply published" }
          : {
              title: "Reply sent for review",
              description: "It appears once our team has checked it.",
            },
      );
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't post your reply", description: errorMessage(err), tone: "error" });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        Your public reply
      </label>
      <Textarea
        id={`reply-${reviewId}`}
        rows={3}
        maxLength={4000}
        autoFocus
        placeholder="Thank the student, add context, or clarify — keep it kind and specific."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
          Publish reply
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

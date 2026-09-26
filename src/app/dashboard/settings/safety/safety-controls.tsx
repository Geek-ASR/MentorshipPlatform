"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Textarea } from "@/ui/input";
import { useToast } from "@/ui/toast";

/** One appeal per decision, within 30 days (docs/10 §7.4), reviewed by a different team member. */
export function AppealButton({ actionId, title }: { actionId: string; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const statementId = useId();
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!statement.trim()) {
      setError("Tell us why you think the decision is wrong.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api(`/api/v1/moderation-actions/${actionId}/appeals`, {
        method: "POST",
        body: { statement: statement.trim() },
      });
      setOpen(false);
      toast({
        title: "Appeal received",
        description: "A different team member will review it, usually within 7 days.",
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Appeal this decision
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!sending}
        title={`Appeal: ${title}`}
        description="You can appeal each decision once. Someone other than the person who made it will review your appeal."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" form={`${statementId}-form`} loading={sending}>
              Send appeal
            </Button>
          </>
        }
      >
        <form id={`${statementId}-form`} onSubmit={onSubmit} className="space-y-4" noValidate>
          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}
          <Field
            label="Why should we look again?"
            htmlFor={statementId}
            hint="What happened from your side, and anything we might have missed. Up to 2,000 characters."
          >
            <Textarea
              id={statementId}
              rows={6}
              maxLength={2000}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}

export function UnblockButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function unblock() {
    setBusy(true);
    try {
      await api(`/api/v1/users/${userId}/block`, { method: "DELETE" });
      toast({ title: `${name.split(" ")[0]} unblocked` });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't unblock", description: errorMessage(err), tone: "error" });
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => void unblock()}>
      Unblock
    </Button>
  );
}

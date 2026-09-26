"use client";

import { useState } from "react";
import { Alert } from "@/ui/alert";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";

/** Booking, paying, reviewing and applying all need a verified email (docs/07 §3.1). */
export function VerifyEmailBanner({ email }: { email: string }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setSending(true);
    try {
      await api("/api/v1/auth/verify-email/resend", { method: "POST" });
      setSent(true);
      toast({ title: "Verification email sent", description: `Check ${email} for a fresh link.` });
    } catch (err) {
      toast({ title: "Couldn't send the email", description: errorMessage(err), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Alert
      tone="warning"
      title="Verify your email to book sessions"
      action={
        <Button size="sm" variant="secondary" loading={sending} disabled={sent} onClick={resend}>
          {sent ? "Link sent" : "Send a new link"}
        </Button>
      }
    >
      We sent a confirmation link to {email}. Until it&apos;s verified you can browse, but not book,
      pay or leave reviews.
    </Alert>
  );
}

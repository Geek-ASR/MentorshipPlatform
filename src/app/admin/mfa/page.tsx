import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/ui/container";
import { MfaStepUpForm } from "./mfa-form";

export const metadata: Metadata = { title: "Verify it's you" };

export default function AdminMfaPage() {
  return (
    <Container className="flex min-h-dvh max-w-md items-center py-12">
      <div className="w-full">
        <h1 className="mb-1 text-xl font-semibold text-ink">Verify it&apos;s you</h1>
        <p className="mb-6 text-sm text-ink-muted">
          Staff access requires multi-factor authentication on every session (docs/07 §3.6).
        </p>
        <Suspense>
          <MfaStepUpForm />
        </Suspense>
      </div>
    </Container>
  );
}

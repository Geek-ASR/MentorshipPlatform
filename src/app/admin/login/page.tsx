import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/ui/container";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in" };

export default function AdminLoginPage() {
  return (
    <Container className="flex min-h-dvh max-w-md items-center py-12">
      <div className="w-full">
        <h1 className="mb-1 text-xl font-semibold text-ink">Staff sign in</h1>
        <p className="mb-6 text-sm text-ink-muted">Sign in with your staff account credentials.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </Container>
  );
}

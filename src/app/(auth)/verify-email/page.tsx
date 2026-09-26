import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "../auth-ui";
import { TokenAction } from "../token-action";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton fields={0} />}>
      <TokenAction
        endpoint="/api/v1/auth/verify-email"
        intro={{
          icon: <MailCheck aria-hidden="true" />,
          title: "Verifying your email",
          description: "Confirming this address belongs to you.",
        }}
        success={{
          title: "Email verified",
          description: "You're all set. Sign in to find a mentor or join a free event.",
          href: "/sign-in?returnTo=/dashboard",
          label: "Continue",
        }}
        failure={{
          title: "This link has expired",
          description:
            "Verification links work once, for 24 hours. Sign in and we'll offer to send you a fresh one.",
          href: "/sign-in?returnTo=/dashboard",
          label: "Sign in",
        }}
      />
    </Suspense>
  );
}

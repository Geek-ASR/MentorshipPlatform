import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { AuthFormSkeleton } from "../auth-ui";
import { TokenAction } from "../token-action";

export const metadata: Metadata = {
  title: "Undo email change",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function UndoEmailChangePage() {
  return (
    <Suspense fallback={<AuthFormSkeleton fields={0} />}>
      <TokenAction
        endpoint="/api/v1/auth/email/change/revert"
        intro={{
          icon: <ShieldAlert aria-hidden="true" />,
          title: "Didn't change your email?",
          description: `We'll switch your ${brand.name} account back to this address and sign out every device, so whoever made the change loses access.`,
        }}
        confirm={{ label: "Undo the change and sign out everywhere", tone: "destructive" }}
        success={{
          title: "Your email is restored",
          description: `Every device has been signed out. Sign in with this address, then choose a new password — and contact ${brand.securityEmail} if anything else looks wrong.`,
          href: "/forgot-password",
          label: "Choose a new password",
        }}
        failure={{
          title: "This link can't be used",
          description: `Undo links work once, for 7 days. If you think someone else is in your account, contact ${brand.securityEmail}.`,
          href: "/sign-in",
          label: "Sign in",
        }}
      />
    </Suspense>
  );
}

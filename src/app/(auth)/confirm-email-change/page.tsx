import { AtSign } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "../auth-ui";
import { TokenAction } from "../token-action";

export const metadata: Metadata = {
  title: "Confirm your new email",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmEmailChangePage() {
  return (
    <Suspense fallback={<AuthFormSkeleton fields={0} />}>
      <TokenAction
        endpoint="/api/v1/auth/email/change/confirm"
        intro={{
          icon: <AtSign aria-hidden="true" />,
          title: "Confirm your new email",
          description:
            "Once confirmed, you'll sign in with this address and all emails will come here. We'll let your old address know, with a way to undo it.",
        }}
        confirm={{ label: "Confirm new email" }}
        success={{
          title: "Email address updated",
          description: "From now on, sign in with your new email address.",
          href: "/dashboard/settings",
          label: "Go to settings",
        }}
        failure={{
          title: "This link has expired",
          description:
            "Confirmation links work once, for 24 hours. Start the change again from your account settings.",
          href: "/dashboard/settings",
          label: "Go to settings",
        }}
      />
    </Suspense>
  );
}

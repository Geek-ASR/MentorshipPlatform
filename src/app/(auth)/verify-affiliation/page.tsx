import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "../auth-ui";
import { TokenAction } from "../token-action";

export const metadata: Metadata = {
  title: "Confirm your affiliation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Landing page for the affiliation email-challenge link (docs/10 §2.2). */
export default function VerifyAffiliationPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton fields={0} />}>
      <TokenAction
        endpoint="/api/v1/verification/email-challenge/confirm"
        intro={{
          icon: <BadgeCheck aria-hidden="true" />,
          title: "Confirm this affiliation",
          description:
            "This confirms the university or workplace on your mentor profile. Your email address itself is never shown to students.",
        }}
        confirm={{ label: "Confirm affiliation" }}
        success={{
          title: "Affiliation confirmed",
          description:
            "Your profile now shows this confirmation with today's month. Once your application is approved, you can be listed.",
          href: "/dashboard/mentor",
          label: "Back to mentoring",
        }}
        failure={{
          title: "This link can't be used",
          description:
            "Confirmation links work once, for 24 hours. Send a new one from the Verification page.",
          href: "/dashboard/mentor/verification",
          label: "Go to verification",
        }}
      />
    </Suspense>
  );
}

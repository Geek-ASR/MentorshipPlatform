import type { Metadata } from "next";
import { Suspense } from "react";
import { getEnv } from "@/config/env";
import { LEGAL_VERSIONS } from "@/config/legal";
import { settingsRegistry } from "@/server/platform/settings/registry";
import { AuthFormSkeleton } from "../auth-ui";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton fields={4} />}>
      <SignUpForm
        termsVersion={LEGAL_VERSIONS.terms}
        privacyVersion={LEGAL_VERSIONS.privacy}
        // The published default; the server enforces the live setting and explains any mismatch.
        minPasswordLength={settingsRegistry["auth.password_min_length"].defaultValue}
        googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)}
      />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { settingsRegistry } from "@/server/platform/settings/registry";
import { AuthFormSkeleton } from "../auth-ui";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <ResetPasswordForm
        minPasswordLength={settingsRegistry["auth.password_min_length"].defaultValue}
      />
    </Suspense>
  );
}

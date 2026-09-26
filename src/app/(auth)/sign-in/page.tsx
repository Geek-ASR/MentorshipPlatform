import type { Metadata } from "next";
import { Suspense } from "react";
import { getEnv } from "@/config/env";
import { AuthFormSkeleton } from "../auth-ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignInForm googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)} />
    </Suspense>
  );
}

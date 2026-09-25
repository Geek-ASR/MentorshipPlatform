"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-primary hover:underline"
      onClick={async () => {
        await fetch("/api/v1/auth/sign-out", { method: "POST", credentials: "same-origin" });
        router.push("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

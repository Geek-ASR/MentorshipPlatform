"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";

export function StartApplicationButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      loading={busy}
      disabled={disabled}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/v1/me/mentor-application", { method: "POST" });
          router.push("/dashboard/mentor/application");
          router.refresh();
        } catch (err) {
          toast({
            title: "Couldn't start your application",
            description: errorMessage(err),
            tone: "error",
          });
          setBusy(false);
        }
      }}
    >
      Start my application
    </Button>
  );
}

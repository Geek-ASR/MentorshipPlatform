"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";

export function SetUpPayoutsButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/v1/me/mentor/payout-account", { method: "POST" });
          toast({ title: "Payouts set up", description: "Paid sessions can now be booked." });
          router.refresh();
        } catch (err) {
          toast({
            title: "Couldn't set up payouts",
            description: errorMessage(err),
            tone: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      Set up payouts
    </Button>
  );
}

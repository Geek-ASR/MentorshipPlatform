"use client";

import { HeartOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";

/** Removes a saved mentor, with an undo in the confirmation toast (docs/22 §4). */
export function UnsaveButton({ mentorUserId, name }: { mentorUserId: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function setSaved(saved: boolean) {
    await api(`/api/v1/me/saved-mentors/${mentorUserId}`, { method: saved ? "POST" : "DELETE" });
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setSaved(false);
          toast({
            title: `Removed ${name}`,
            action: { label: "Undo", onClick: () => void setSaved(true) },
          });
        } catch (err) {
          toast({ title: "Couldn't remove", description: errorMessage(err), tone: "error" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <HeartOff aria-hidden="true" /> Remove
    </Button>
  );
}

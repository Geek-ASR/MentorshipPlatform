"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { useToast } from "@/ui/toast";
import { useViewer } from "@/ui/viewer";

/** Save a mentor for later (the dashboard's saved list). Signed-out visitors are sent to sign in. */
export function SaveMentorButton({
  mentorUserId,
  slug,
  firstName,
}: {
  mentorUserId: string;
  slug: string;
  firstName: string;
}) {
  const viewerState = useViewer();
  const viewer = viewerState.status === "ready" ? viewerState.viewer : null;
  const toast = useToast();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    api<{ mentorUserIds: string[] }>("/api/v1/me/saved-mentors")
      .then((data) => {
        if (!cancelled) setSaved(data.mentorUserIds.includes(mentorUserId));
      })
      .catch(() => {
        if (!cancelled) setSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewer, mentorUserId]);

  if (viewerState.status === "ready" && !viewer) {
    return (
      <Button asChild variant="secondary">
        <Link href={`/sign-in?returnTo=${encodeURIComponent(`/mentors/${slug}`)}`}>
          <Heart aria-hidden="true" /> Save
        </Link>
      </Button>
    );
  }
  if (viewer?.id === mentorUserId) return null;

  async function toggle() {
    if (saved === null) return;
    const next = !saved;
    setBusy(true);
    setSaved(next);
    try {
      await api(`/api/v1/me/saved-mentors/${mentorUserId}`, { method: next ? "POST" : "DELETE" });
      toast({
        title: next ? `Saved ${firstName}` : `Removed ${firstName} from saved`,
        description: next ? "Find them any time on your dashboard." : undefined,
      });
    } catch (err) {
      setSaved(!next);
      toast({
        title: "Couldn't update saved mentors",
        description: errorMessage(err),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={toggle}
      disabled={saved === null || busy}
      aria-pressed={saved === true}
    >
      <Heart
        aria-hidden="true"
        className={cn(saved ? "fill-danger text-danger" : "text-ink-muted")}
      />
      {saved ? "Saved" : "Save"}
    </Button>
  );
}

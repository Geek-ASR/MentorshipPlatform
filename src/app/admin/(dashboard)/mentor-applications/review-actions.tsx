"use client";

import { useState } from "react";
import { ActionButton } from "@/ui/action-button";
import { Button } from "@/ui/button";

export function ReviewApplicationActions({ userId }: { userId: string }) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  if (showReject) {
    return (
      <div className="flex flex-col gap-1">
        <input
          placeholder="Rejection reason"
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          className="h-8 w-48 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-xs"
        />
        <div className="flex gap-1">
          <ActionButton
            path={`/api/v1/admin/mentor-applications/${userId}/review`}
            body={{ decision: "rejected", rejectionReason }}
            variant="destructive"
            onDone={() => setShowReject(false)}
          >
            Confirm reject
          </ActionButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowReject(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <ActionButton
        path={`/api/v1/admin/mentor-applications/${userId}/review`}
        body={{ decision: "approved" }}
        variant="secondary"
      >
        Approve
      </ActionButton>
      <button
        type="button"
        className="text-sm text-danger hover:underline"
        onClick={() => setShowReject(true)}
      >
        Reject
      </button>
      <ActionButton
        path={`/api/v1/admin/mentor-applications/${userId}/review`}
        body={{ decision: "paused" }}
        variant="ghost"
      >
        Pause
      </ActionButton>
    </div>
  );
}

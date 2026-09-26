import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock3,
  Hourglass,
  Scale,
  Undo2,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./cn";

type Tone = "success" | "warning" | "danger" | "neutral" | "primary";

/** Booking statuses in plain words — icon + text, never colour alone (docs/22 §6.1). */
const BOOKING_STATUS: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  held: { label: "Awaiting payment", tone: "warning", icon: Hourglass },
  confirmed: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
  expired: { label: "Hold expired", tone: "neutral", icon: CircleDashed },
  cancelled_by_student: { label: "Cancelled by you", tone: "neutral", icon: CircleSlash },
  cancelled_by_mentor: { label: "Cancelled by mentor", tone: "danger", icon: CircleSlash },
  cancelled_by_admin: { label: "Cancelled by support", tone: "neutral", icon: CircleSlash },
  cancelled_system: { label: "Cancelled", tone: "neutral", icon: CircleSlash },
  awaiting_outcome: { label: "Wrapping up", tone: "primary", icon: Clock3 },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  no_show_mentor: { label: "Mentor didn't join", tone: "danger", icon: UserX },
  no_show_student: { label: "Marked as missed", tone: "warning", icon: UserX },
  disputed: { label: "Under review", tone: "warning", icon: Scale },
  resolved_refunded: { label: "Refunded", tone: "neutral", icon: Undo2 },
  payment_orphaned: { label: "Refund on the way", tone: "neutral", icon: Undo2 },
};

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-ink/5 text-ink-muted",
  primary: "bg-primary-soft text-primary",
};

export function BookingStatusBadge({ status, className }: { status: string; className?: string }) {
  const entry = BOOKING_STATUS[status] ?? {
    label: status,
    tone: "neutral" as Tone,
    icon: CircleDashed,
  };
  const Icon = entry.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASS[entry.tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {entry.label}
    </span>
  );
}

import { CheckCircle2, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

const TONES = {
  info: { icon: Info, box: "border-primary/25 bg-primary-soft/60", iconClass: "text-primary" },
  success: { icon: CheckCircle2, box: "border-success/30 bg-success/8", iconClass: "text-success" },
  warning: {
    icon: TriangleAlert,
    box: "border-warning/35 bg-warning/8",
    iconClass: "text-warning",
  },
  danger: { icon: OctagonAlert, box: "border-danger/30 bg-danger/8", iconClass: "text-danger" },
} as const;

/**
 * Inline banner for notices that must be read in place (docs/22 §4 partial/degraded and
 * restricted states, disclaimers). Icon + text, never colour alone (docs/22 §6.1).
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
  live = false,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Announce on render (use for errors that appear after a submit). */
  live?: boolean;
}) {
  const { icon: Icon, box, iconClass } = TONES[tone];
  return (
    <div
      role={live ? "alert" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-sm",
        box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn("text-ink/85", title && "mt-0.5")}>{children}</div> : null}
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
    </div>
  );
}

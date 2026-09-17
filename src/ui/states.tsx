import type { ReactNode } from "react";
import { cn } from "./cn";

type StateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/** Explains why something is empty and offers one next step (docs/22 §4). */
export function EmptyState({ title, description, action, icon, className }: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-ink-muted">{icon}</div> : null}
      <p className="font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Human-readable failure with a recovery action and an optional support reference. */
export function ErrorState({
  title,
  description,
  action,
  className,
  reference,
}: StateProps & { reference?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <p className="font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
      {reference ? (
        <p className="mt-4 text-xs text-ink-muted">
          Reference: <code className="tabular select-all">{reference}</code>
        </p>
      ) : null}
    </div>
  );
}

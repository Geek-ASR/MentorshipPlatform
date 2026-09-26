import type { ReactNode } from "react";
import { cn } from "./cn";

/** Title block for signed-in pages: one h1, optional description and actions (docs/22 §8). */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-sm font-medium text-primary">{eyebrow}</p> : null}
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Section heading inside a page, with an optional right-aligned link or action. */
export function SectionHeader({
  title,
  action,
  id,
}: {
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}

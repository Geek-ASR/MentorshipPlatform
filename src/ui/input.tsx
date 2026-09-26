import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />
  );
}

const controlBase =
  "w-full rounded-[var(--radius-control)] border border-line bg-surface text-sm text-ink transition-colors placeholder:text-ink-muted/80 hover:border-ink/25 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/30 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-11 px-3", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlBase, "h-11 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(controlBase, "px-3 py-2.5 leading-relaxed", className)} {...props} />
  );
}

/**
 * One labelled control + inline error or hint (docs/22 §4, §8). The message is linked to the
 * control via `aria-describedby` and the control gets `aria-invalid` — injected into the single
 * child element so callers can't forget the wiring.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
  className,
  labelAction,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
  /** Right-aligned element on the label row, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
}) {
  const messageId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const control = only
    ? cloneElement(only as ReactElement<Record<string, unknown>>, {
        "aria-describedby": messageId,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>
          {label}
          {optional ? <span className="ml-1 font-normal text-ink-muted">(optional)</span> : null}
        </Label>
        {labelAction}
      </div>
      {control}
      {error ? (
        <p id={messageId} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "mt-0.5 size-4 shrink-0 rounded border-line accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
      {...props}
    />
  );
}

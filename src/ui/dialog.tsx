"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Modal dialog on the native `<dialog>` element (docs/22 §6.4, §8): `showModal()` gives the top
 * layer, inert background, focus containment and Escape handling for free, and the browser returns
 * focus to the opener on close. On phones it docks to the bottom as a sheet (docs/22 §7).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** False while a request is in flight: Escape and backdrop clicks are ignored. */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-[var(--radius-sheet)] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-overlay)] open:animate-rise-in",
        "max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none",
        { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size],
      )}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="mt-1 text-sm text-ink-muted">
              {description}
            </div>
          ) : null}
        </div>
        {dismissible ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-canvas hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {children ? <div className="px-6 pt-4">{children}</div> : null}
      {footer ? (
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      ) : (
        <div className="pb-6" />
      )}
    </dialog>
  );
}

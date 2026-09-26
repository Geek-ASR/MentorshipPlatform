"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** e.g. an undo (docs/22 §4 "destructive actions offer undo where feasible"). */
  action?: { label: string; onClick: () => void };
};
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const TONE_ICON = { success: CheckCircle2, error: TriangleAlert, info: Info } as const;
const TONE_CLASS = { success: "text-success", error: "text-danger", info: "text-primary" } as const;
const DISMISS_AFTER_MS = 6000;

/**
 * Success/next-step confirmations (docs/22 §4). One polite live region for all toasts, so screen
 * readers hear each message once; toasts pause while hovered or focused.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [paused, onDismiss]);

  const tone = toast.tone ?? "success";
  const Icon = TONE_ICON[tone];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-rise-in items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-overlay)]"
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", TONE_CLASS[tone])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-sm text-ink-muted">{toast.description}</p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className="mt-2 text-sm font-semibold text-primary hover:underline"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-canvas hover:text-ink"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const push = useContext(ToastContext);
  return useMemo(
    () =>
      push ??
      (() => {
        // Rendering outside the provider (e.g. an isolated test) must never crash the page.
      }),
    [push],
  );
}

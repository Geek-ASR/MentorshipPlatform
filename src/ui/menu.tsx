"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";

const MenuContext = createContext<{ close: () => void } | null>(null);

/**
 * Disclosure-style menu button (WAI-ARIA menu button pattern): arrow keys move between items,
 * Escape closes and returns focus to the trigger, Tab or an outside click closes.
 */
export function Menu({
  trigger,
  label,
  align = "end",
  triggerClassName,
  children,
}: {
  trigger: ReactNode;
  /** Accessible name for the trigger when its content is only an avatar or icon. */
  label?: string;
  align?: "start" | "end";
  triggerClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <MenuContext.Provider value={{ close: () => close(false) }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className={cn(
              "absolute top-full z-40 mt-2 min-w-56 animate-rise-in rounded-[var(--radius-card)] border border-line bg-surface p-1.5 shadow-[var(--shadow-overlay)]",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {children}
          </div>
        </MenuContext.Provider>
      ) : null}
    </div>
  );
}

const itemClass =
  "flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-sm text-ink outline-none hover:bg-canvas focus-visible:bg-primary-soft focus-visible:outline-none [&_svg]:size-4 [&_svg]:text-ink-muted";

export function MenuItem({
  href,
  onSelect,
  children,
  tone,
}: {
  href?: string;
  onSelect?: () => void;
  children: ReactNode;
  tone?: "danger";
}) {
  const menu = useContext(MenuContext);
  const className = cn(itemClass, tone === "danger" && "text-danger [&_svg]:text-danger");
  if (href) {
    return (
      <Link href={href} role="menuitem" tabIndex={-1} className={className} onClick={menu?.close}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={className}
      onClick={() => {
        menu?.close();
        onSelect?.();
      }}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-line" />;
}

export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-2 pb-2.5">{children}</div>;
}

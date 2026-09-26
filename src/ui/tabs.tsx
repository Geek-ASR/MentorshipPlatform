"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type TabItem = { id: string; label: string; count?: number; content: ReactNode };

/**
 * WAI-ARIA tabs: arrow keys, Home and End move between tabs; only the active tab is in the tab
 * order. Panels are rendered by the server and only switched here, so the page works (showing the
 * first tab) before hydration.
 */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const baseId = useId();
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next]!;
    setActive(target.id);
    refs.current.get(target.id)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-6 overflow-x-auto border-b border-line"
      >
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) refs.current.set(item.id, el);
                else refs.current.delete(item.id);
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 text-sm font-medium transition-colors",
                selected
                  ? "border-primary text-ink"
                  : "border-transparent text-ink-muted hover:border-line hover:text-ink",
              )}
            >
              {item.label}
              {item.count !== undefined ? (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-xs",
                    selected ? "bg-primary-soft text-primary" : "bg-ink/5 text-ink-muted",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          tabIndex={0}
          className="pt-6 focus-visible:outline-none"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

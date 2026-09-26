"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/ui/cn";

/** Filters sit in a left rail on large screens and behind a toggle on small ones (docs/22 §7). */
export function FiltersDisclosure({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="explore-filters"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface text-sm font-medium text-ink lg:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
      <div id="explore-filters" className={cn("mt-4 lg:mt-0 lg:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  );
}

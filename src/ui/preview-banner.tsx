"use client";

import { Eye } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PREVIEW_ACCOUNTS, PREVIEW_PERSONA, PREVIEW_ROOT } from "@/config/preview";
import { cn } from "./cn";
import { useToast } from "./toast";

const PERSONA_ROOT = { student: PREVIEW_ROOT, mentor: `${PREVIEW_ROOT}/as-mentor` } as const;

/**
 * Shown on every page of the GitHub Pages preview (docs/19 Phase 15e): says plainly that the data
 * is fictional and nothing is saved, switches between the student and mentor view, and explains
 * the few links that need the real server (calendar files, joining a call) instead of a 404.
 */
export function PreviewBanner() {
  const toast = useToast();
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest("a");
      if (!link || !link.getAttribute("href")?.startsWith("/api/")) return;
      event.preventDefault();
      toast({
        title: "Not available in the preview",
        description: "Calendar files and joining a call need the real server.",
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [toast]);

  // Signed-in pages differ per person (booking ids, for one), so switching lands on the dashboard.
  const path = pathname.startsWith("/dashboard") ? "/dashboard/" : pathname;
  const switchTo = (persona: "student" | "mentor") =>
    `${PERSONA_ROOT[persona]}${path === "/" ? "/" : path}`;

  return (
    <div className="border-b border-accent/30 bg-accent-soft text-ink">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <p className="flex items-center gap-2">
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Preview</span> with fictional sample data — nothing you
            do here is saved.{" "}
            <a href={`${PREVIEW_ROOT}/progress/`} className="underline underline-offset-2">
              Build progress
            </a>
          </span>
        </p>
        <nav aria-label="Preview view" className="flex items-center gap-1">
          <span className="mr-1 text-ink-muted">View as</span>
          {(["student", "mentor"] as const).map((persona) => (
            <a
              key={persona}
              href={switchTo(persona)}
              aria-current={persona === PREVIEW_PERSONA ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors",
                persona === PREVIEW_PERSONA
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:bg-surface/60 hover:text-ink",
              )}
            >
              {persona === "student" ? "Student" : "Mentor"} ·{" "}
              {PREVIEW_ACCOUNTS[persona].name.split(" ")[0]}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

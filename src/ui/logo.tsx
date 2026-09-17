import { brand } from "@/config/brand";
import { cn } from "./cn";

/** Two offset rounded squares forming a step: "one step ahead" (docs/22 §5). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect x="3" y="15" width="14" height="14" rx="4" className="fill-primary" />
      <rect x="15" y="3" width="14" height="14" rx="4" className="fill-accent" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-ink lowercase">{brand.name}</span>
    </span>
  );
}

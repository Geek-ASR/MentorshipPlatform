import { brand } from "@/config/brand";
import { cn } from "./cn";

/** Two offset rounded squares forming a step: "one step ahead" (docs/22 §5). */
export function LogoMark({
  className,
  inverse = false,
}: {
  className?: string;
  inverse?: boolean;
}) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect
        x="3"
        y="15"
        width="14"
        height="14"
        rx="4"
        className={inverse ? "fill-on-primary" : "fill-primary"}
      />
      <rect x="15" y="3" width="14" height="14" rx="4" className="fill-accent" />
    </svg>
  );
}

/** `inverse` is for placement on the primary colour (brand panels, the mentor CTA band). */
export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark inverse={inverse} />
      <span
        className={cn(
          "text-lg font-semibold tracking-tight lowercase",
          inverse ? "text-on-primary" : "text-ink",
        )}
      >
        {brand.name}
      </span>
    </span>
  );
}

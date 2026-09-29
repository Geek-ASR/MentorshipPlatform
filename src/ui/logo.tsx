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
        className={inverse ? "fill-white" : "fill-primary"}
      />
      {/* The brand's dusty pink (#F2C3B9) in every mode — the dark-mode petal token is a deep tint. */}
      <rect x="15" y="3" width="14" height="14" rx="4" className="fill-[#f2c3b9]" />
    </svg>
  );
}

/** `inverse` is for the night surface (sign-in panel, footer, the mentor band). */
export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark inverse={inverse} />
      <span
        className={cn(
          "text-lg font-semibold tracking-tight lowercase",
          inverse ? "text-on-night" : "text-ink",
        )}
      >
        {brand.name}
      </span>
    </span>
  );
}

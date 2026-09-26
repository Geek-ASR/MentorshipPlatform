import { cn } from "./cn";
import { initials, toneFor } from "./format";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
  "2xl": "size-28 text-4xl",
} as const;

/**
 * Initials avatar with a stable identity tone (docs/22 §6.4). No photos yet: real, consented mentor
 * photos arrive with media uploads, and initials never impersonate anyone. Decorative by default —
 * the person's name is always printed next to it; pass `label` when it stands alone.
 */
export function Avatar({
  name,
  seed,
  size = "md",
  label,
  className,
}: {
  name: string;
  /** Defaults to `name`; pass a stable id so renames keep the colour. */
  seed?: string;
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight select-none",
        toneFor(seed ?? name),
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

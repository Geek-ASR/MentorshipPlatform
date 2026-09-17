import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Placeholder matching final layout dimensions; hidden from assistive technology. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-[var(--radius-control)] bg-line/70", className)}
      {...props}
    />
  );
}

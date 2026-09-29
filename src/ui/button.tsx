import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(var(--shadow-color)/0.18),0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:bg-primary-strong",
        accent:
          "bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(var(--shadow-color)/0.18),0_4px_12px_-4px_color-mix(in_oklab,var(--accent)_55%,transparent)] hover:bg-accent/90",
        secondary:
          "border border-line bg-surface text-ink shadow-[0_1px_2px_rgb(var(--shadow-color)/0.05)] hover:border-primary/35 hover:bg-primary-soft/50",
        ghost: "text-ink hover:bg-primary-soft",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
        destructive: "bg-danger text-white shadow-sm hover:bg-danger/90",
        /** On the night surface (hero, sign-in panel, mentor band). */
        inverse: "bg-white text-night shadow-sm hover:bg-white/90",
        "ghost-inverse": "text-on-night ring-1 ring-white/25 hover:bg-white/10",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10 p-0",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows an inline spinner, marks the button busy and blocks repeat submits. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  type,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), loading && "disabled:opacity-90", className)}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

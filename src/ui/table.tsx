import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Plain server-rendered table (docs/22 §6.4 "Table (admin; sortable, filterable, paginated)") —
 * sorting/filtering/pagination are query-string driven (Server Components re-fetch on navigation,
 * matching the codebase's existing SSR-first pattern), not a client-side data-grid dependency.
 */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Thead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-primary-soft/40 text-left", className)} {...props} />;
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("px-4 py-3 font-medium whitespace-nowrap text-ink-muted", className)}
      {...props}
    />
  );
}

export function Tbody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-primary-soft/20", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-ink", className)} {...props} />;
}

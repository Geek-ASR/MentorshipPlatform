import type { ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/ui/cn";

export function AuthHeader({
  title,
  description,
  icon,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {icon ? (
        <div className="mb-5 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      {description ? <p className="mt-2 text-ink-muted">{description}</p> : null}
    </div>
  );
}

export function AuthSwitch({
  prompt,
  href,
  label,
  className,
}: {
  prompt: string;
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <p className={cn("mt-8 text-center text-sm text-ink-muted", className)}>
      {prompt}{" "}
      <Link href={href} className="font-semibold text-primary hover:underline">
        {label}
      </Link>
    </p>
  );
}

/** Matches the form's final layout so the Suspense fallback causes no shift (docs/22 §4). */
export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-5 w-72" />
      <div className="mt-8 space-y-5">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}

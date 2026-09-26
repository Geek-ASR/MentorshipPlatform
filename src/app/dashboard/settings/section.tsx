import type { ReactNode } from "react";

/** Settings block: explanation on the left, the control card on the right (stacked on phones). */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-1 gap-4 border-b border-line pb-10 last:border-b-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2 id={id} className="font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
        {children}
      </div>
    </section>
  );
}

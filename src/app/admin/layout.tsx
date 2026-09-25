import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Bare wrapper for everything under `/admin/*` — no auth gate and no sidebar here on purpose:
 * `/admin/login` and `/admin/mfa` must render without either (see their own docstrings), so the
 * gated shell lives one level deeper, in `admin/(dashboard)/layout.tsx`. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="min-h-dvh bg-canvas">{children}</div>;
}

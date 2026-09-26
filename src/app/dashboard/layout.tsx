import type { Metadata } from "next";
import { Search } from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { loadPageViewer, toClientViewer } from "@/server/views/viewer";
import { AccountMenu } from "@/ui/header-actions";
import { LogoMark } from "@/ui/logo";
import { SkipLink } from "@/ui/site-chrome";
import { DashboardMobileNav, DashboardSidebar } from "./dashboard-nav";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: `%s · ${brand.name}` },
  robots: { index: false, follow: false },
};

/**
 * Signed-in app shell (docs/22 §2 "Signed-in app"). Access is enforced by each page's
 * `requireViewer(path)` — see `server/views/viewer.ts` for why the redirect isn't here.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const loaded = await loadPageViewer();
  if (!loaded) return <>{children}</>;
  const viewer = toClientViewer(loaded);

  return (
    <div className="flex min-h-dvh">
      <SkipLink />
      <DashboardSidebar viewer={viewer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
          <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-3 px-4 sm:px-6 lg:px-10">
            <DashboardMobileNav viewer={viewer} />
            <Link href="/" aria-label={`${brand.name} home`} className="rounded-md lg:hidden">
              <LogoMark />
            </Link>
            <form action="/mentors" method="GET" role="search" className="relative max-w-md flex-1">
              <label htmlFor="dashboard-search" className="sr-only">
                Search mentors
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <input
                id="dashboard-search"
                type="search"
                name="q"
                placeholder="Search mentors, universities, topics"
                className="h-10 w-full rounded-full border border-line bg-surface pr-4 pl-9 text-sm text-ink placeholder:text-ink-muted/80 hover:border-ink/25 focus-visible:border-primary"
              />
            </form>
            <div className="ml-auto">
              <AccountMenu viewer={viewer} />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

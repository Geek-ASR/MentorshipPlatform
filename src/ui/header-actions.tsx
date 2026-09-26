"use client";

import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "./avatar";
import { Button } from "./button";
import { cn } from "./cn";
import { Menu, MenuHeader, MenuItem, MenuSeparator } from "./menu";
import { Skeleton } from "./skeleton";
import { isStaff, signOut, useViewer, type Viewer } from "./viewer";

type NavItem = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors",
                  active ? "font-medium text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AccountMenu({ viewer }: { viewer: Viewer }) {
  return (
    <Menu
      label="Account menu"
      triggerClassName="flex items-center gap-1.5 rounded-full p-0.5 pr-2 hover:bg-primary-soft aria-expanded:bg-primary-soft"
      trigger={
        <>
          <Avatar name={viewer.displayName} seed={viewer.id} size="sm" />
          <ChevronDown className="size-4 text-ink-muted" aria-hidden="true" />
        </>
      }
    >
      <MenuHeader>
        <p className="truncate text-sm font-semibold text-ink">{viewer.displayName}</p>
        <p className="truncate text-xs text-ink-muted">{viewer.email}</p>
      </MenuHeader>
      <MenuSeparator />
      <MenuItem href="/dashboard">
        <LayoutDashboard aria-hidden="true" /> Dashboard
      </MenuItem>
      <MenuItem href="/dashboard/settings">
        <Settings aria-hidden="true" /> Settings
      </MenuItem>
      {isStaff(viewer.roles) ? (
        <MenuItem href="/admin">
          <ShieldCheck aria-hidden="true" /> Staff console
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem onSelect={() => void signOut()}>
        <LogOut aria-hidden="true" /> Sign out
      </MenuItem>
    </Menu>
  );
}

/**
 * Right side of the public header: session-aware account controls plus the small-screen menu
 * (docs/22 §7). Rendered client-side so public pages stay statically rendered.
 */
export function HeaderActions({ nav }: { nav: NavItem[] }) {
  const state = useViewer();
  const pathname = usePathname();
  // The menu belongs to the page it was opened on: navigating anywhere closes it by itself.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const toggle = () => setOpenOn((current) => (current === pathname ? null : pathname));
  const viewer = state.status === "ready" ? state.viewer : null;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const returnTo = pathname && pathname !== "/" ? `?returnTo=${encodeURIComponent(pathname)}` : "";

  return (
    <>
      <div className="hidden items-center gap-2 md:flex">
        {state.status === "loading" ? (
          <Skeleton className="h-9 w-40" />
        ) : viewer ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <AccountMenu viewer={viewer} />
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/sign-in${returnTo}`}>Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </>
        )}
      </div>

      <button
        type="button"
        className="-mr-2 flex size-11 items-center justify-center rounded-[var(--radius-control)] text-ink hover:bg-primary-soft lg:hidden"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={toggle}
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <MenuIcon className="size-5" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 top-16 bottom-0 z-40 animate-fade-in overflow-y-auto border-t border-line bg-canvas lg:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6">
            {viewer ? (
              <div className="mb-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <Avatar name={viewer.displayName} seed={viewer.id} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{viewer.displayName}</p>
                  <p className="truncate text-sm text-ink-muted">{viewer.email}</p>
                </div>
              </div>
            ) : null}
            <ul className="divide-y divide-line">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className="flex min-h-12 items-center text-base text-ink aria-[current=page]:font-semibold aria-[current=page]:text-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3">
              {viewer ? (
                <>
                  <Button asChild size="lg">
                    <Link href="/dashboard">Go to dashboard</Link>
                  </Button>
                  <Button asChild size="lg" variant="secondary">
                    <Link href="/dashboard/settings">Settings</Link>
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => void signOut()}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href="/sign-up">Get started — it&apos;s free</Link>
                  </Button>
                  <Button asChild size="lg" variant="secondary">
                    <Link href={`/sign-in${returnTo}`}>Sign in</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}

"use client";

import {
  CalendarHeart,
  Compass,
  LayoutDashboard,
  Menu as MenuIcon,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/config/brand";
import { cn } from "@/ui/cn";
import { Logo } from "@/ui/logo";
import { isStaff, type Viewer } from "@/ui/viewer";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type NavSection = { title?: string; items: NavItem[] };

function sectionsFor(viewer: Viewer): NavSection[] {
  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/dashboard/settings", label: "Settings", icon: Settings },
      ],
    },
    {
      title: "Discover",
      items: [
        { href: "/mentors", label: "Find a mentor", icon: Compass },
        { href: "/events", label: "Free events", icon: CalendarHeart },
      ],
    },
  ];
  if (isStaff(viewer.roles)) {
    sections.push({
      title: "Staff",
      items: [{ href: "/admin", label: "Staff console", icon: ShieldCheck }],
    });
  }
  return sections;
}

function NavList({ viewer, onNavigate }: { viewer: Viewer; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      {sectionsFor(viewer).map((section, index) => (
        <div key={section.title ?? index}>
          {section.title ? (
            <p className="mb-2 px-3 text-xs font-medium tracking-wide text-ink-muted uppercase">
              {section.title}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors",
                      active
                        ? "bg-primary-soft font-medium text-primary"
                        : "text-ink-muted hover:bg-canvas hover:text-ink",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DashboardSidebar({ viewer }: { viewer: Viewer }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center px-6">
        <Link href="/" aria-label={`${brand.name} home`} className="rounded-md">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-4">
        <NavList viewer={viewer} />
      </nav>
      <div className="border-t border-line p-4 text-xs text-ink-muted">
        Early access · payments run in test mode
      </div>
    </aside>
  );
}

/** Small-screen navigation drawer on a native modal `<dialog>` (focus trap + Escape for free). */
export function DashboardMobileNav({ viewer }: { viewer: Viewer }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  // Open "on" a path: following any link in the drawer closes it without an extra effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="-ml-2 flex size-10 items-center justify-center rounded-[var(--radius-control)] text-ink hover:bg-primary-soft lg:hidden"
      >
        <MenuIcon className="size-5" aria-hidden="true" />
      </button>
      <dialog
        ref={ref}
        aria-label="Navigation"
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === event.currentTarget && setOpen(false)}
        className="m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-r border-line bg-surface p-0 open:animate-fade-in"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="flex size-10 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-canvas hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Dashboard" className="px-3 py-4">
          <NavList viewer={viewer} onNavigate={() => setOpen(false)} />
        </nav>
      </dialog>
    </>
  );
}
